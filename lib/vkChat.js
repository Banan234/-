// Файл отправляет уведомления менеджеру во VK и принимает ответы обратно в диалоги сайта.

import crypto from 'crypto';
import { logger } from './logger.js';

function readVkConfig(env = process.env) {
  return {
    accessToken: String(env.VK_COMMUNITY_ACCESS_TOKEN || '').trim(),
    managerPeerId: String(env.VK_MANAGER_PEER_ID || '').trim(),
    callbackSecret: String(env.VK_CALLBACK_SECRET || '').trim(),
    confirmationToken: String(env.VK_CALLBACK_CONFIRMATION_TOKEN || '').trim(),
    groupId: String(env.VK_GROUP_ID || '').trim(),
    apiVersion: String(env.VK_API_VERSION || '5.131').trim() || '5.131',
    managerUserIds: String(env.VK_MANAGER_USER_IDS || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  };
}

function createNoopResult() {
  return { ok: true, handled: false };
}

function buildConversationLabel(conversationId) {
  return `#chat_${conversationId}`;
}

function escapeVkText(value) {
  return String(value || '').trim();
}

function buildNotificationText({ title, conversation, message }) {
  const customerContact = escapeVkText(conversation.customerPhone) || 'не указан';
  const lines = [
    title,
    buildConversationLabel(conversation.id),
    `Контакт: ${customerContact}`,
    `Источник: ${escapeVkText(conversation.source) || '—'}`,
  ];

  if (conversation.customerName) {
    lines.push(`Имя: ${escapeVkText(conversation.customerName)}`);
  }

  lines.push('');
  lines.push(escapeVkText(message.text));
  lines.push('');
  lines.push(
    `Ответьте реплаем на это сообщение или командой /reply ${conversation.id} <текст>`
  );

  return lines.join('\n');
}

function parseReplyCommand(text) {
  const match = /^\/reply\s+([a-z0-9-]+)\s+([\s\S]+)$/i.exec(
    String(text || '').trim()
  );
  if (!match) return null;

  return {
    conversationId: match[1],
    message: match[2].trim(),
  };
}

function parseConversationIdFromText(text) {
  const match = /#chat_([a-z0-9-]+)/i.exec(String(text || ''));
  return match?.[1] || '';
}

function getManagerDisplayName(message) {
  const fromId = String(message?.from_id || '').trim();
  return fromId ? `VK user ${fromId}` : 'Менеджер VK';
}

function getRandomId() {
  return crypto.randomInt(1, 2_147_483_647);
}

function extractVkMessage(object) {
  if (object?.message && typeof object.message === 'object') {
    return object.message;
  }

  return object && typeof object === 'object' ? object : null;
}

function normalizePeerId(value) {
  return String(value || '').trim();
}

function normalizeVkSendResult(result, fallbackPeerId) {
  if (Array.isArray(result)) {
    const item = result[0] && typeof result[0] === 'object' ? result[0] : null;
    if (item?.error) {
      throw new Error(String(item.error || 'VK API messages.send failed'));
    }
    return item;
  }

  if (result && typeof result === 'object') {
    if (result.error) {
      throw new Error(String(result.error || 'VK API messages.send failed'));
    }
    return result;
  }

  if (Number.isInteger(result) && result > 0) {
    return {
      peer_id: Number(fallbackPeerId) || fallbackPeerId,
      message_id: result,
      conversation_message_id: 0,
    };
  }

  return null;
}

export function createVkChatBridge({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = readVkConfig(env);

  async function callVk(method, params) {
    if (!config.accessToken || typeof fetchImpl !== 'function') {
      throw new Error('VK community bot is not configured');
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...params,
      access_token: config.accessToken,
      v: config.apiVersion,
    })) {
      if (value == null || value === '') continue;
      body.set(key, String(value));
    }

    const response = await fetchImpl(`https://api.vk.ru/method/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      throw new Error(`VK API ${method} returned invalid JSON`);
    }

    if (!response.ok || result.error) {
      throw new Error(
        result.error?.error_msg || `VK API ${method} failed`
      );
    }

    return result.response;
  }

  async function sendManagerMessage(payload) {
    if (!config.accessToken || !config.managerPeerId) return null;

    return callVk('messages.send', {
      peer_ids: config.managerPeerId,
      message: payload.text,
      random_id: getRandomId(),
      disable_mentions: 1,
    });
  }

  async function notify({ title, conversation, message }) {
    const sentMessage = normalizeVkSendResult(
      await sendManagerMessage({
        text: buildNotificationText({ title, conversation, message }),
      }),
      config.managerPeerId
    );

    if (!sentMessage || typeof sentMessage !== 'object') {
      return null;
    }

    return {
      channel: 'vk',
      peerId: String(sentMessage.peer_id || config.managerPeerId),
      messageId: Number(sentMessage.message_id) || 0,
      conversationMessageId: Number(sentMessage.conversation_message_id) || 0,
    };
  }

  return {
    get callbackSecret() {
      return config.callbackSecret;
    },

    get confirmationToken() {
      return config.confirmationToken;
    },

    isAllowedManager(message) {
      const fromId = String(message?.from_id || '').trim();
      if (config.managerUserIds.length === 0) {
        return Boolean(fromId);
      }

      return Boolean(fromId && config.managerUserIds.includes(fromId));
    },

    isConfigured() {
      return Boolean(config.accessToken && config.managerPeerId);
    },

    async configureWebhook() {
      return false;
    },

    async notifyConversationCreated(conversation) {
      const customerMessage =
        conversation.messages[conversation.messages.length - 1] || null;
      if (!customerMessage) return null;

      return notify({
        title: 'Новый диалог с сайта',
        conversation,
        message: customerMessage,
      });
    },

    async notifyCustomerMessage(conversation, message) {
      return notify({
        title: 'Клиент написал в чат сайта',
        conversation,
        message,
      });
    },

    requiresCallbackSecret() {
      return this.isConfigured();
    },

    async sendManagerAck(peerId, replyConversationMessageId, text) {
      if (!this.isConfigured()) return null;

      const params = {
        peer_id: peerId,
        message: text,
        random_id: getRandomId(),
        disable_mentions: 1,
      };

      if (Number(replyConversationMessageId) > 0) {
        params.conversation_message_ids = Number(replyConversationMessageId);
        params.is_reply = 1;
      }

      return callVk('messages.send', params);
    },

    async handleCallbackUpdate(update, { chatStore }) {
      const type = String(update?.type || '').trim();
      const eventId = String(update?.event_id || '').trim();
      const processedEventId = eventId ? `vk:${eventId}` : '';

      async function markProcessed() {
        if (!processedEventId) return true;
        return chatStore.markManagerEventProcessed(processedEventId);
      }

      async function sendManagerAckSafe(peerId, replyConversationMessageId, text) {
        try {
          await this.sendManagerAck(peerId, replyConversationMessageId, text);
        } catch (error) {
          logger.error('vk.callback.ack_failed', {
            err: error,
            peerId,
            replyConversationMessageId,
          });
        }
      }

      if (type === 'confirmation') {
        return { ok: true, handled: true, confirmation: true };
      }

      if (!this.isConfigured()) return createNoopResult();

      if (processedEventId) {
        const alreadyProcessed =
          await chatStore.hasManagerEventProcessed(processedEventId);
        if (alreadyProcessed) {
          return { ok: true, handled: true, duplicate: true };
        }
      }

      if (config.groupId && String(update?.group_id || '').trim() !== config.groupId) {
        return createNoopResult();
      }

      if (type !== 'message_new') {
        return createNoopResult();
      }

      const message = extractVkMessage(update?.object);
      if (!message) {
        return createNoopResult();
      }

      if (Number(message.out) === 1) {
        return createNoopResult();
      }

      const peerId = normalizePeerId(message.peer_id || message.user_id);
      if (peerId !== config.managerPeerId) {
        return createNoopResult();
      }

      if (!this.isAllowedManager(message)) {
        return { ok: true, handled: false, reason: 'manager_not_allowed' };
      }

      const rawText = String(message.text || message.body || '').trim();
      if (!rawText) {
        return createNoopResult();
      }

      let conversationId = '';
      let replyText = rawText;

      const replyMessage =
        message.reply_message && typeof message.reply_message === 'object'
          ? message.reply_message
          : null;

      if (replyMessage) {
        const conversation =
          await chatStore.findConversationByManagerNotification({
            channel: 'vk',
            peerId,
            messageId: replyMessage.id,
            conversationMessageId: replyMessage.conversation_message_id,
          });

        if (conversation) {
          conversationId = conversation.id;
        } else {
          conversationId = parseConversationIdFromText(
            replyMessage.text || replyMessage.body || ''
          );
        }
      }

      if (!conversationId) {
        const command = parseReplyCommand(rawText);
        if (command) {
          conversationId = command.conversationId;
          replyText = command.message;
        }
      }

      if (!conversationId || !replyText) {
        await sendManagerAckSafe.call(
          this,
          peerId,
          Number(message.conversation_message_id) || 0,
          'Не удалось определить диалог. Ответьте реплаем на уведомление бота или используйте /reply <conversationId> <текст>.'
        );
        await markProcessed();
        return { ok: true, handled: false, reason: 'conversation_not_resolved' };
      }

      const appended = await chatStore.appendManagerMessage(conversationId, replyText, {
        channel: 'vk',
        eventId: processedEventId,
        peerId,
        messageId: Number(message.id) || 0,
        conversationMessageId: Number(message.conversation_message_id) || 0,
        fromId: String(message.from_id || ''),
        name: getManagerDisplayName(message),
      });

      if (!appended) {
        await sendManagerAckSafe.call(
          this,
          peerId,
          Number(message.conversation_message_id) || 0,
          `Диалог ${buildConversationLabel(conversationId)} не найден.`
        );
        await markProcessed();
        return { ok: true, handled: false, reason: 'conversation_not_found' };
      }

      await markProcessed();
      await sendManagerAckSafe.call(
        this,
        peerId,
        Number(message.conversation_message_id) || 0,
        `Ответ отправлен клиенту (${buildConversationLabel(conversationId)}).`
      );

      return { ok: true, handled: true, conversationId };
    },
  };
}

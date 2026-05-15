// Файл отправляет уведомления менеджеру в Telegram и принимает ответы обратно в диалоги сайта.

function readTelegramConfig(env = process.env) {
  return {
    botToken: String(env.TELEGRAM_BOT_TOKEN || '').trim(),
    managerChatId: String(env.TELEGRAM_MANAGER_CHAT_ID || '').trim(),
    webhookSecret: String(env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
    webhookUrl: String(env.TELEGRAM_WEBHOOK_URL || '').trim().replace(/\/+$/, ''),
  };
}

function createNoopResult() {
  return { ok: true, handled: false };
}

function buildConversationLabel(conversationId) {
  return `#chat_${conversationId}`;
}

function escapeTelegramText(value) {
  return String(value || '').trim();
}

function buildNotificationText({ title, conversation, message }) {
  const lines = [
    title,
    buildConversationLabel(conversation.id),
    `Клиент: ${escapeTelegramText(conversation.customerPhone)}`,
    `Источник: ${escapeTelegramText(conversation.source) || '—'}`,
  ];

  if (conversation.customerName) {
    lines.push(`Имя: ${escapeTelegramText(conversation.customerName)}`);
  }

  lines.push('');
  lines.push(escapeTelegramText(message.text));
  lines.push('');
  lines.push(
    `Ответьте реплаем на это сообщение или командой /reply ${conversation.id} <текст>`
  );

  return lines.join('\n');
}

function getManagerDisplayName(from) {
  const firstName = String(from?.first_name || '').trim();
  const lastName = String(from?.last_name || '').trim();
  const username = String(from?.username || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || (username ? `@${username}` : 'Менеджер');
}

function parseReplyCommand(text) {
  const match = /^\/reply(?:@\w+)?\s+([a-z0-9-]+)\s+([\s\S]+)$/i.exec(
    String(text || '').trim()
  );
  if (!match) return null;

  return {
    conversationId: match[1],
    message: match[2].trim(),
  };
}

export function createTelegramChatBridge({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = readTelegramConfig(env);

  async function callTelegram(method, body) {
    if (!config.botToken || typeof fetchImpl !== 'function') {
      throw new Error('Telegram bot is not configured');
    }

    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.botToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    let result = {};
    try {
      result = await response.json();
    } catch {
      throw new Error(`Telegram API ${method} returned invalid JSON`);
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.description || `Telegram API ${method} failed`);
    }

    return result.result;
  }

  async function sendManagerMessage(payload) {
    if (!config.botToken || !config.managerChatId) return null;

    return callTelegram('sendMessage', {
      chat_id: config.managerChatId,
      text: payload.text,
      disable_web_page_preview: true,
    });
  }

  async function notify({ title, conversation, message }) {
    const sentMessage = await sendManagerMessage({
      text: buildNotificationText({ title, conversation, message }),
    });

    return sentMessage
      ? {
          chatId: String(sentMessage.chat?.id || config.managerChatId),
          messageId: Number(sentMessage.message_id) || 0,
        }
      : null;
  }

  return {
    get webhookSecret() {
      return config.webhookSecret;
    },

    isConfigured() {
      return Boolean(config.botToken && config.managerChatId);
    },

    async configureWebhook() {
      if (!this.isConfigured()) return false;
      if (!config.webhookUrl || !config.webhookSecret) return false;

      await callTelegram('setWebhook', {
        url: `${config.webhookUrl}/api/telegram/webhook/${config.webhookSecret}`,
        secret_token: config.webhookSecret,
        allowed_updates: ['message'],
      });

      return true;
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

    async sendManagerAck(chatId, replyToMessageId, text) {
      if (!this.isConfigured()) return null;

      return callTelegram('sendMessage', {
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true,
      });
    },

    async handleWebhookUpdate(update, { chatStore }) {
      if (!this.isConfigured()) return createNoopResult();

      const updateId = Number(update?.update_id);
      if (Number.isInteger(updateId)) {
        const accepted = await chatStore.markTelegramUpdateProcessed(updateId);
        if (!accepted) {
          return { ok: true, handled: true, duplicate: true };
        }
      }

      const message = update?.message;
      if (!message || typeof message !== 'object') {
        return createNoopResult();
      }

      const chatId = String(message.chat?.id || '');
      if (chatId !== config.managerChatId) {
        return createNoopResult();
      }

      const rawText = String(message.text || '').trim();
      if (!rawText) {
        return createNoopResult();
      }

      let conversationId = '';
      let replyText = rawText;

      if (message.reply_to_message?.message_id) {
        const conversation = await chatStore.findConversationByTelegramNotification(
          chatId,
          message.reply_to_message.message_id
        );

        if (conversation) {
          conversationId = conversation.id;
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
        await this.sendManagerAck(
          chatId,
          message.message_id,
          'Не удалось определить диалог. Ответьте реплаем на уведомление бота или используйте /reply <conversationId> <текст>.'
        );
        return { ok: true, handled: false, reason: 'conversation_not_resolved' };
      }

      const appended = await chatStore.appendManagerMessage(conversationId, replyText, {
        chatId,
        messageId: Number(message.message_id) || 0,
        fromId: String(message.from?.id || ''),
        username: String(message.from?.username || ''),
        name: getManagerDisplayName(message.from),
      });

      if (!appended) {
        await this.sendManagerAck(
          chatId,
          message.message_id,
          `Диалог ${buildConversationLabel(conversationId)} не найден.`
        );
        return { ok: true, handled: false, reason: 'conversation_not_found' };
      }

      await this.sendManagerAck(
        chatId,
        message.message_id,
        `Ответ отправлен клиенту (${buildConversationLabel(conversationId)}).`
      );

      return { ok: true, handled: true, conversationId };
    },
  };
}

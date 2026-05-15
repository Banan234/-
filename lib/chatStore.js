// Файл хранит диалоги сайта в памяти или JSON-файле и умеет связывать их с Telegram-уведомлениями.

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { messages } from '../shared/messages.js';

function nowIso() {
  return new Date().toISOString();
}

function createMessage(role, text, meta = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    createdAt: nowIso(),
    ...meta,
  };
}

function createGreetingMessage() {
  return {
    id: 'greeting',
    role: 'manager',
    text: messages.text.chatGreeting,
    createdAt: null,
  };
}

function createConversationRecord({
  customerPhone,
  customerName = '',
  source = '',
  initialMessage,
}) {
  const createdAt = nowIso();

  return {
    id: crypto.randomUUID(),
    customerToken: crypto.randomBytes(16).toString('hex'),
    customerPhone,
    customerName: customerName || '',
    source: source || '',
    createdAt,
    updatedAt: createdAt,
    telegramNotifications: [],
    messages: [
      createGreetingMessage(),
      createMessage('customer', initialMessage),
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState() {
  return {
    conversations: [],
    telegram: {
      processedUpdateIds: [],
    },
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  const conversations = Array.isArray(state.conversations)
    ? state.conversations
    : [];
  const processedUpdateIds = Array.isArray(state.telegram?.processedUpdateIds)
    ? state.telegram.processedUpdateIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0)
        .slice(-500)
    : [];

  return {
    conversations: conversations
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id || ''),
        customerToken: String(entry.customerToken || ''),
        customerPhone: String(entry.customerPhone || ''),
        customerName: String(entry.customerName || ''),
        source: String(entry.source || ''),
        createdAt: String(entry.createdAt || nowIso()),
        updatedAt: String(entry.updatedAt || entry.createdAt || nowIso()),
        telegramNotifications: Array.isArray(entry.telegramNotifications)
          ? entry.telegramNotifications
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({
                chatId: String(item.chatId || ''),
                messageId: Number(item.messageId) || 0,
                createdAt: String(item.createdAt || nowIso()),
              }))
              .filter((item) => item.chatId && item.messageId > 0)
          : [],
        messages: Array.isArray(entry.messages)
          ? entry.messages
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({
                id: String(item.id || crypto.randomUUID()),
                role: item.role === 'manager' ? 'manager' : 'customer',
                text: String(item.text || ''),
                createdAt:
                  item.createdAt == null ? null : String(item.createdAt || ''),
                telegram:
                  item.telegram && typeof item.telegram === 'object'
                    ? {
                        chatId: String(item.telegram.chatId || ''),
                        messageId: Number(item.telegram.messageId) || 0,
                        fromId: String(item.telegram.fromId || ''),
                        username: String(item.telegram.username || ''),
                        name: String(item.telegram.name || ''),
                      }
                    : undefined,
              }))
          : [createGreetingMessage()],
      }))
      .filter(
        (entry) =>
          entry.id &&
          entry.customerToken &&
          entry.customerPhone &&
          Array.isArray(entry.messages) &&
          entry.messages.length > 0
      ),
    telegram: {
      processedUpdateIds,
    },
  };
}

function toCustomerConversation(conversation) {
  return {
    id: conversation.id,
    customerName: conversation.customerName,
    source: conversation.source,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
    })),
  };
}

function findConversation(state, conversationId) {
  return state.conversations.find((entry) => entry.id === conversationId) || null;
}

function createStore({ readState, writeState }) {
  let queue = Promise.resolve();

  function runExclusive(task) {
    const next = queue.then(task, task);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function mutate(mutator) {
    return runExclusive(async () => {
      const state = normalizeState(await readState());
      const result = await mutator(state);
      await writeState(state);
      return result;
    });
  }

  async function read() {
    return normalizeState(await readState());
  }

  return {
    async createConversation(payload) {
      return mutate(async (state) => {
        const conversation = createConversationRecord(payload);
        state.conversations.push(conversation);
        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
          customerToken: conversation.customerToken,
        };
      });
    },

    async getConversation(conversationId) {
      const state = await read();
      const conversation = findConversation(state, conversationId);
      return conversation ? clone(conversation) : null;
    },

    async getConversationForCustomer(conversationId, token) {
      const state = await read();
      const conversation = findConversation(state, conversationId);
      if (!conversation || conversation.customerToken !== token) {
        return null;
      }
      return toCustomerConversation(conversation);
    },

    async appendCustomerMessage(conversationId, token, text) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation || conversation.customerToken !== token) {
          return null;
        }

        conversation.messages.push(createMessage('customer', text));
        conversation.updatedAt = nowIso();

        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
        };
      });
    },

    async appendManagerMessage(conversationId, text, telegramMeta = null) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation) {
          return null;
        }

        conversation.messages.push(
          createMessage(
            'manager',
            text,
            telegramMeta ? { telegram: telegramMeta } : {}
          )
        );
        conversation.updatedAt = nowIso();

        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
        };
      });
    },

    async registerTelegramNotification(conversationId, notification) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation) return null;

        conversation.telegramNotifications.push({
          chatId: String(notification.chatId || ''),
          messageId: Number(notification.messageId) || 0,
          createdAt: nowIso(),
        });
        conversation.telegramNotifications =
          conversation.telegramNotifications.slice(-50);
        conversation.updatedAt = nowIso();

        return clone(conversation);
      });
    },

    async findConversationByTelegramNotification(chatId, messageId) {
      const state = await read();
      const normalizedChatId = String(chatId || '');
      const normalizedMessageId = Number(messageId) || 0;
      const conversation =
        state.conversations.find((entry) =>
          entry.telegramNotifications.some(
            (item) =>
              item.chatId === normalizedChatId &&
              item.messageId === normalizedMessageId
          )
        ) || null;

      return conversation ? clone(conversation) : null;
    },

    async markTelegramUpdateProcessed(updateId) {
      return mutate(async (state) => {
        const normalized = Number(updateId);
        if (!Number.isInteger(normalized) || normalized < 0) {
          return false;
        }

        if (state.telegram.processedUpdateIds.includes(normalized)) {
          return false;
        }

        state.telegram.processedUpdateIds.push(normalized);
        state.telegram.processedUpdateIds =
          state.telegram.processedUpdateIds.slice(-500);
        return true;
      });
    },
  };
}

export function createInMemoryChatStore(initialState = createInitialState()) {
  let state = normalizeState(initialState);

  return createStore({
    async readState() {
      return clone(state);
    },
    async writeState(nextState) {
      state = normalizeState(clone(nextState));
    },
  });
}

async function ensureJsonFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(createInitialState(), null, 2),
      'utf8'
    );
  }
}

function resolveChatStorePath(env = process.env) {
  const configuredPath = String(env.CHAT_STORE_FILE || '').trim();
  return configuredPath || path.resolve(process.cwd(), 'data/chat-store.json');
}

export function createFileChatStore({
  filePath = resolveChatStorePath(),
} = {}) {
  return createStore({
    async readState() {
      await ensureJsonFile(filePath);
      const raw = await fs.readFile(filePath, 'utf8');
      try {
        return normalizeState(JSON.parse(raw));
      } catch {
        return createInitialState();
      }
    },
    async writeState(nextState) {
      await ensureJsonFile(filePath);
      await fs.writeFile(filePath, JSON.stringify(nextState, null, 2), 'utf8');
    },
  });
}

// Файл добавляет плавающий чат-виджет с реальным диалогом клиента и менеджера.

import { useEffect, useRef, useState } from 'react';
import HoneypotField from '../forms/HoneypotField';
import { expectOkApiJson } from '../../lib/apiResponse';
import {
  loadStoredJson,
  removeStoredValue,
  saveStoredJson,
} from '../../lib/browserStorage';
import { captureException } from '../../lib/errorTracking';
import { trackEvent } from '../../lib/analytics';
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF } from '../../lib/siteConfig';
import { messages } from '../../../shared/messages.js';
import { isValidRussianPhone } from '../../../shared/quoteValidation.js';

const CHAT_SESSION_STORAGE_KEY = 'yuzhural-chat-session';
const CHAT_POLL_INTERVAL_MS = 5_000;
const INITIAL_MESSAGES = Object.freeze([
  {
    id: 'greeting',
    role: 'manager',
    text: messages.text.chatGreeting,
    createdAt: null,
  },
]);

const initialForm = {
  phone: '',
  comment: '',
  consent: false,
};

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, '');
}

function getStoredSession() {
  const stored = loadStoredJson(CHAT_SESSION_STORAGE_KEY, null);

  if (
    stored &&
    typeof stored === 'object' &&
    typeof stored.conversationId === 'string' &&
    typeof stored.customerToken === 'string'
  ) {
    return {
      conversationId: stored.conversationId,
      customerToken: stored.customerToken,
    };
  }

  return null;
}

function formatMessageTime(value) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function getConversationMessages(conversation) {
  if (
    conversation &&
    Array.isArray(conversation.messages) &&
    conversation.messages.length > 0
  ) {
    return conversation.messages;
  }

  return INITIAL_MESSAGES;
}

export default function FloatingLeadWidget({
  autoOpen = true,
  sourceLabel = 'Главная страница',
}) {
  const [form, setForm] = useState(initialForm);
  const [honeypot, setHoneypot] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ kind: '', text: '' });
  const [session, setSession] = useState(() => getStoredSession());
  const [conversation, setConversation] = useState(null);
  const [conversationMessages, setConversationMessages] =
    useState(INITIAL_MESSAGES);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const renderedAtRef = useRef(Date.now());
  const autoOpenTrackedRef = useRef(false);
  const phoneInputRef = useRef(null);
  const sessionRef = useRef(session);
  const messagesEndRef = useRef(null);
  const fieldIds = {
    phone: 'floating-lead-phone',
    comment: 'floating-lead-comment',
    consent: 'floating-lead-consent',
  };
  const errorIds = {
    phone: `${fieldIds.phone}-error`,
    consent: `${fieldIds.consent}-error`,
  };

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!autoOpen) return;
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(min-width: 901px)');
    if (!mediaQuery.matches) return;

    const timer = window.setTimeout(() => {
      setIsOpen(true);
      if (!autoOpenTrackedRef.current) {
        trackEvent('lead-widget-open', {
          source: sourceLabel,
          trigger: 'auto',
        });
        autoOpenTrackedRef.current = true;
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [autoOpen, sourceLabel]);

  useEffect(() => {
    if (!isCaptureOpen) return;

    phoneInputRef.current?.focus();
  }, [isCaptureOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [conversationMessages, isCaptureOpen]);

  useEffect(() => {
    if (!session) {
      setConversation(null);
      setConversationMessages(INITIAL_MESSAGES);
      return undefined;
    }

    let isDisposed = false;

    async function loadConversation({ silent = false } = {}) {
      const activeSession = sessionRef.current;
      if (!activeSession) return;

      if (!silent) {
        setIsConversationLoading(true);
      }

      try {
        const response = await fetch(
          `/api/chat/conversations/${encodeURIComponent(activeSession.conversationId)}?token=${encodeURIComponent(activeSession.customerToken)}`
        );
        const result = await expectOkApiJson(
          response,
          messages.errors.api.chatLoadFailed
        );

        if (isDisposed) return;

        setConversation(result.conversation);
        setConversationMessages(getConversationMessages(result.conversation));
        setIsCaptureOpen(false);
      } catch (error) {
        if (isDisposed) return;

        if (error?.message === messages.errors.api.chatNotFound) {
          removeStoredValue(CHAT_SESSION_STORAGE_KEY);
          setSession(null);
          setConversation(null);
          setConversationMessages(INITIAL_MESSAGES);
          setStatus({ kind: '', text: '' });
        } else {
          captureException(error, { source: 'FloatingLeadWidget.loadChat' });
          setStatus({
            kind: 'error',
            text: error.message || messages.errors.api.chatLoadFailed,
          });
        }
      } finally {
        if (!isDisposed) {
          setIsConversationLoading(false);
        }
      }
    }

    loadConversation();
    const pollTimer = window.setInterval(() => {
      loadConversation({ silent: true });
    }, CHAT_POLL_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(pollTimer);
    };
  }, [session]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }));
    setStatus({ kind: '', text: '' });
  }

  function validateLeadCapture() {
    const nextErrors = {};
    const normalizedPhone = normalizePhone(form.phone.trim());

    if (!isValidRussianPhone(normalizedPhone)) {
      nextErrors.phone = messages.errors.leadForm.phoneInvalid;
    }

    if (!form.consent) {
      nextErrors.consent = messages.errors.leadForm.consentRequired;
    }

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedComment = form.comment.trim();
    if (!trimmedComment) {
      setStatus({
        kind: 'error',
        text: messages.errors.chat.messageRequired,
      });
      return;
    }

    if (!conversation && !isCaptureOpen) {
      setIsCaptureOpen(true);
      setStatus({ kind: '', text: '' });
      return;
    }

    if (!conversation) {
      const nextErrors = validateLeadCapture();
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setStatus({ kind: '', text: '' });

      if (!conversation) {
        const response = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: form.phone.trim(),
            message: trimmedComment,
            source: `Компактный виджет: ${sourceLabel}`,
            createdAt: new Date().toLocaleString('ru-RU'),
            rendered_at: renderedAtRef.current,
            submit_at: Date.now(),
            company_website: honeypot,
          }),
        });

        const result = await expectOkApiJson(
          response,
          messages.errors.api.chatSendFailed
        );

        const nextSession = {
          conversationId: result.conversationId,
          customerToken: result.customerToken,
        };

        saveStoredJson(CHAT_SESSION_STORAGE_KEY, nextSession);
        setSession(nextSession);
        setConversation(result.conversation);
        setConversationMessages(getConversationMessages(result.conversation));
        setForm(initialForm);
        setErrors({});
        setIsCaptureOpen(false);
        renderedAtRef.current = Date.now();
        setStatus({
          kind: 'success',
          text: result.message || messages.success.chatStarted,
        });
        trackEvent('lead-widget-submit', {
          source: sourceLabel,
          hasComment: true,
        });
        return;
      }

      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(session.conversationId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: session.customerToken,
            message: trimmedComment,
          }),
        }
      );

      const result = await expectOkApiJson(
        response,
        messages.errors.api.chatSendFailed
      );

      setConversation(result.conversation);
      setConversationMessages(getConversationMessages(result.conversation));
      setForm((prev) => ({
        ...prev,
        comment: '',
      }));
    } catch (error) {
      captureException(error, { source: 'FloatingLeadWidget.submit' });
      setStatus({
        kind: 'error',
        text: error.message || messages.errors.api.chatSendFailed,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpen() {
    setIsOpen(true);
    trackEvent('lead-widget-open', {
      source: sourceLabel,
      trigger: 'manual',
    });
  }

  return (
    <div
      className={`floating-lead-widget${isOpen ? ' floating-lead-widget--open' : ' floating-lead-widget--closed'}`}
    >
      {isOpen ? (
        <section
          className="floating-lead-widget__panel"
          aria-label="Окно сообщений"
        >
          <div className="floating-lead-widget__header">
            <h2 className="floating-lead-widget__title">
              Отправьте нам сообщение
            </h2>
            <button
              type="button"
              className="floating-lead-widget__close"
              aria-label="Свернуть виджет"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <form
            className="floating-lead-widget__shell"
            onSubmit={handleSubmit}
            noValidate
          >
            <HoneypotField
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />

            <div className="floating-lead-widget__body">
              {status.text ? (
                <div
                  className={`${status.kind === 'error' ? 'form-error' : 'form-success'} floating-lead-widget__status`}
                >
                  {status.text}
                </div>
              ) : null}

              <div className="floating-lead-widget__messages">
                {isConversationLoading ? (
                  <div className="floating-lead-widget__loading">
                    Загружаем диалог...
                  </div>
                ) : null}

                {conversationMessages.map((message) => {
                  const messageTime = formatMessageTime(message.createdAt);
                  const isCustomerMessage = message.role === 'customer';

                  return (
                    <div
                      key={message.id}
                      className={`floating-lead-widget__message-row${isCustomerMessage ? ' floating-lead-widget__message-row--customer' : ''}`}
                    >
                      <div
                        className={`floating-lead-widget__bubble${isCustomerMessage ? ' floating-lead-widget__bubble--customer' : ''}`}
                      >
                        <div className="floating-lead-widget__bubble-text">
                          {message.text}
                        </div>
                        {messageTime ? (
                          <div className="floating-lead-widget__bubble-time">
                            {messageTime}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {isCaptureOpen ? (
              <div className="floating-lead-widget__capture">
                <div className="floating-lead-widget__capture-head">
                  <span className="floating-lead-widget__capture-label">
                    Оставьте телефон для связи
                  </span>
                  <a
                    href={SITE_PHONE_HREF}
                    className="floating-lead-widget__phone-link"
                  >
                    {SITE_PHONE_DISPLAY}
                  </a>
                </div>

                <label
                  className="floating-lead-widget__field"
                  htmlFor={fieldIds.phone}
                >
                  <span className="visually-hidden">Телефон</span>
                  <input
                    ref={phoneInputRef}
                    id={fieldIds.phone}
                    name="phone"
                    type="text"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+7 904 306-94-94"
                    autoComplete="tel"
                    aria-invalid={errors.phone ? 'true' : undefined}
                    aria-describedby={errors.phone ? errorIds.phone : undefined}
                  />
                </label>
                {errors.phone ? (
                  <span id={errorIds.phone} className="field-error">
                    {errors.phone}
                  </span>
                ) : null}

                <label className="floating-lead-widget__consent">
                  <input
                    id={fieldIds.consent}
                    name="consent"
                    type="checkbox"
                    checked={form.consent}
                    onChange={handleChange}
                    aria-invalid={errors.consent ? 'true' : undefined}
                    aria-describedby={
                      errors.consent ? errorIds.consent : undefined
                    }
                  />
                  <span>
                    Даю согласие на{' '}
                    <a href="/privacy">обработку персональных данных</a>
                  </span>
                </label>
                {errors.consent ? (
                  <span id={errorIds.consent} className="field-error">
                    {errors.consent}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="floating-lead-widget__composer">
              <span
                className="floating-lead-widget__composer-tool floating-lead-widget__composer-tool--attach"
                aria-hidden="true"
              >
                📎
              </span>

              <label
                className="floating-lead-widget__composer-input"
                htmlFor={fieldIds.comment}
              >
                <span className="visually-hidden">Введите сообщение</span>
                <textarea
                  id={fieldIds.comment}
                  name="comment"
                  value={form.comment}
                  onChange={handleChange}
                  placeholder="Введите сообщение"
                  rows={1}
                />
              </label>

              <button
                type="submit"
                className="floating-lead-widget__send"
                disabled={isSubmitting}
                aria-label={
                  isSubmitting ? 'Отправляем сообщение' : 'Отправить сообщение'
                }
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 5v14"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="m7 10 5-5 5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          className="floating-lead-widget__launcher"
          onClick={handleOpen}
        >
          <span
            className="floating-lead-widget__launcher-icon"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7.5h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="m5 8 7 5 7-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="floating-lead-widget__launcher-text">
            Отправьте нам сообщение
          </span>
        </button>
      )}
    </div>
  );
}

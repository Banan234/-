import { useRef, useState } from 'react';

const quickCommentOptions = [
  { label: 'ВВГ', value: 'ВВГ' },
  { label: 'АВВГ', value: 'АВВГ' },
  { label: 'КГ', value: 'КГ' },
  { label: 'Нужен подбор', value: 'Нужен подбор кабеля' },
];

const initialForm = {
  name: '',
  phone: '',
  comment: '',
  consent: false,
};

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, '');
}

export default function HeroLeadForm() {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const commentRef = useRef(null);

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

    setServerMessage('');
    setIsSubmitted(false);
  }

  function validate() {
    const nextErrors = {};
    const normalizedPhone = normalizePhone(form.phone.trim());

    if (normalizedPhone.replace(/\D/g, '').length < 10) {
      nextErrors.phone = 'Укажите корректный телефон';
    }

    if (!form.consent) {
      nextErrors.consent = 'Нужно согласие на обработку данных';
    }

    return nextErrors;
  }

  function parseCommentTokens(comment) {
    return comment
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function handleQuickComment(value) {
    setForm((prev) => {
      const items = parseCommentTokens(prev.comment);
      const hasValue = items.includes(value);
      const nextComment = hasValue
        ? items.filter((item) => item !== value).join(', ')
        : [...items, value].join(', ');

      return {
        ...prev,
        comment: nextComment,
      };
    });

    setErrors((prev) => ({
      ...prev,
      comment: '',
    }));
    setServerMessage('');
    setIsSubmitted(false);

    requestAnimationFrame(() => {
      commentRef.current?.focus();
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitted(false);
      return;
    }

    try {
      setIsSubmitting(true);
      setServerMessage('');

      const response = await fetch('/api/lead-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          comment: form.comment.trim() || 'Заявка с первого экрана главной страницы',
          createdAt: new Date().toLocaleString('ru-RU'),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Не удалось отправить заявку');
      }

      setIsSubmitted(true);
      setServerMessage(result.message || 'Заявка отправлена');
      setForm(initialForm);
      setErrors({});
    } catch (error) {
      console.error('Ошибка отправки заявки с главной:', error);
      setIsSubmitted(false);
      setServerMessage(error.message || 'Не удалось отправить заявку');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="hero-lead-card">
      <div className="hero-lead-card__head">
        <h2 className="hero-lead-card__title">Не тратьте время на поиск кабеля</h2>
        <p className="hero-lead-card__subtitle">
          Ответим в течение 15 минут
        </p>
      </div>

      {isSubmitted ? <div className="form-success">{serverMessage}</div> : null}

      {!isSubmitted && serverMessage ? (
        <div className="form-error">{serverMessage}</div>
      ) : null}

      <form className="hero-lead-form" onSubmit={handleSubmit} noValidate>
        <div className="hero-lead-form__field">
          <label htmlFor="lead-phone">Ваш телефон</label>
          <input
            id="lead-phone"
            name="phone"
            type="text"
            value={form.phone}
            onChange={handleChange}
            placeholder="+7 ___ - __ - __"
          />
          {errors.phone ? (
            <span className="field-error">{errors.phone}</span>
          ) : null}
        </div>

        <div className="hero-lead-form__field">
          <label htmlFor="lead-name">Ваше имя <span className="hero-lead-form__optional">(необязательно)</span></label>
          <input
            id="lead-name"
            name="name"
            type="text"
            required={false}
            value={form.name}
            onChange={handleChange}
            placeholder="Как к вам обращаться"
          />
        </div>

        <div className="hero-lead-form__field">
          <label htmlFor="lead-comment">Комментарий <span className="hero-lead-form__optional">(необязательно)</span></label>
          <div className="hero-lead-form__quick-buttons" aria-label="Быстрые варианты комментария">
            {quickCommentOptions.map((option) => {
              const isActive = parseCommentTokens(form.comment).includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`hero-lead-form__quick-btn${isActive ? ' hero-lead-form__quick-btn--active' : ''}`}
                  onClick={() => handleQuickComment(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <textarea
            ref={commentRef}
            id="lead-comment"
            name="comment"
            value={form.comment}
            onChange={handleChange}
            placeholder="Например: ВВГ 3×2.5, 500 метров"
            className="hero-lead-form__textarea"
            rows={3}
          />
        </div>

        <label className="hero-lead-form__consent">
          <input
            name="consent"
            type="checkbox"
            checked={form.consent}
            onChange={handleChange}
          />
          <span>Даю согласие на обработку персональных данных</span>
        </label>
        {errors.consent ? (
          <span className="field-error">{errors.consent}</span>
        ) : null}

        <button
          type="submit"
          className="button-primary hero-lead-form__submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Отправка...' : 'Получить КП'}
        </button>
      </form>
    </div>
  );
}

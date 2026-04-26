// Скрытое поле-ловушка для ботов. Реальные пользователи его не видят
// и не заполняют (off-screen + tabIndex=-1 + autocomplete=off).
// Сервер при заполнении этого поля отдаёт фейковый success и не шлёт письмо.
export default function HoneypotField({ value, onChange }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-10000px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      <label>
        Сайт компании (не заполняйте)
        <input
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={onChange}
        />
      </label>
    </div>
  );
}

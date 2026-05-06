// Файл задаёт переиспользуемый контейнер ширины для страниц и секций интерфейса.

export default function Container({ children }) {
  return <div className="container">{children}</div>;
}

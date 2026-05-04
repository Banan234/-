import { SITE_NAME } from './siteConfig.js';

export const STATIC_PAGE_SEO = {
  about: {
    path: '/about',
    title: 'О компании',
    fullTitle: `О компании — ${SITE_NAME}`,
    description:
      'ЮжУралЭлектроКабель — надёжный поставщик кабельно-проводниковой продукции. Работаем с 2008 года, более 5000 позиций в наличии.',
  },
  delivery: {
    path: '/delivery',
    title: 'Доставка',
    fullTitle: `Доставка — ${SITE_NAME}`,
    description:
      'Доставка кабельно-проводниковой продукции по всей России. Самовывоз со склада в Челябинске или через транспортные компании.',
  },
  payment: {
    path: '/payment',
    title: 'Оплата',
    fullTitle: `Оплата — ${SITE_NAME}`,
    description:
      'Условия оплаты в ЮжУралЭлектроКабель: безналичный расчёт, наличные, счёт для юридических лиц и ИП. НДС, первичные документы.',
  },
};

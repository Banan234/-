// Файл собирает JSON-LD для статических страниц: организация, хлебные крошки и информационные разделы.

import {
  SITE_NAME,
  SITE_PHONE,
  SITE_URL,
  absoluteUrl,
  buildOrganizationJsonLd,
} from './siteConfig.js';
import { STATIC_PAGE_SEO } from './staticSeo.js';

const STATIC_PAGE_JSON_LD_IDS = {
  '/about': 'about-page-json-ld',
  '/payment': 'payment-page-json-ld',
  '/delivery': 'delivery-page-json-ld',
};

function buildWebsiteReference() {
  return {
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  };
}

function buildOrganizationReference() {
  return buildOrganizationJsonLd();
}

function buildAboutPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${absoluteUrl('/about')}#webpage`,
        url: absoluteUrl('/about'),
        name: STATIC_PAGE_SEO.about.fullTitle,
        description: STATIC_PAGE_SEO.about.description,
        isPartOf: buildWebsiteReference(),
        about: { '@id': `${SITE_URL}#organization` },
      },
      buildOrganizationReference(),
    ],
  };
}

function buildPaymentPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl('/payment')}#webpage`,
        url: absoluteUrl('/payment'),
        name: STATIC_PAGE_SEO.payment.fullTitle,
        description: STATIC_PAGE_SEO.payment.description,
        isPartOf: buildWebsiteReference(),
        provider: buildOrganizationReference(),
      },
      {
        '@type': 'FAQPage',
        '@id': `${absoluteUrl('/payment')}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Можно ли оплатить кабель по безналичному расчету?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Да, для юридических лиц и ИП выставляем счет, работаем с НДС и передаем закрывающие документы.',
            },
          },
          {
            '@type': 'Question',
            name: 'Какие документы выдаются после оплаты?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Передаем счет, УПД или товарную накладную, счет-фактуру при необходимости и договор поставки по согласованию.',
            },
          },
        ],
      },
    ],
  };
}

function buildDeliveryPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl('/delivery')}#webpage`,
        url: absoluteUrl('/delivery'),
        name: STATIC_PAGE_SEO.delivery.fullTitle,
        description: STATIC_PAGE_SEO.delivery.description,
        isPartOf: buildWebsiteReference(),
        provider: {
          ...buildOrganizationJsonLd({ '@type': 'LocalBusiness' }),
          telephone: SITE_PHONE,
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${absoluteUrl('/delivery')}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Как быстро отгружается кабель со склада?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Позиции в наличии обычно готовим к отгрузке от 1 рабочего дня после оплаты и согласования комплектации.',
            },
          },
          {
            '@type': 'Question',
            name: 'Можно ли отправить заказ транспортной компанией?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Да, отправляем кабельную продукцию транспортными компаниями по России и согласуем способ доставки при оформлении заказа.',
            },
          },
        ],
      },
    ],
  };
}

export function getStaticPageJsonLdId(path) {
  return STATIC_PAGE_JSON_LD_IDS[path] || '';
}

export function buildStaticPageJsonLd(path) {
  if (path === '/about') return buildAboutPageJsonLd();
  if (path === '/payment') return buildPaymentPageJsonLd();
  if (path === '/delivery') return buildDeliveryPageJsonLd();
  return null;
}

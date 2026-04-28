export const DEFAULT_LOCALE = 'ru';

export const MESSAGE_DICTIONARIES = Object.freeze({
  ru: Object.freeze({
    errors: Object.freeze({
      api: Object.freeze({
        expectedJsonContentType: 'Ожидается Content-Type: application/json',
        payloadTooLarge: 'Слишком большой запрос',
        quoteRateLimited:
          'Слишком много заявок. Попробуйте через час или позвоните нам.',
        catalogLoadFailed: 'Не удалось загрузить каталог',
        productsLoadFailed: 'Не удалось загрузить позиции',
        suggestionsLoadFailed: 'Не удалось загрузить подсказки',
        relatedProductsLoadFailed: 'Не удалось загрузить похожие товары',
        productLoadFailed: 'Не удалось загрузить товар',
        productNotFound: 'Товар не найден',
        idsArrayExpected: 'Ожидается массив ids',
        tooManyIds: 'Слишком много id (максимум {max})',
        lookupFailed: 'Не удалось сверить позиции',
        invalidQuoteRequest: 'Некорректные данные заявки',
        quoteSendFailed: 'Не удалось отправить заявку',
        phoneInvalid: 'Укажите корректный телефон',
      }),
      cart: Object.freeze({
        manualTitleRequired: 'Укажите марку или наименование позиции',
        manualTitleTooLong: 'Наименование не должно превышать {max} символов',
        manualCommentTooLong: 'Комментарий не должен превышать {max} символов',
        quantityRequired: 'Укажите метраж или объём',
        limitReached:
          'В списке уже {max} позиций — отправьте КП или удалите лишние позиции',
        pdfBuildFailed: 'Не удалось сформировать PDF',
      }),
      errorBoundary: Object.freeze({
        title: 'Что-то пошло не так',
        description:
          'Мы уже получили уведомление и разбираемся. Попробуйте перезагрузить страницу — если ошибка повторится, позвоните нам.',
      }),
      home: Object.freeze({
        featuredLoadFailed: 'Не удалось загрузить позиции из каталога.',
      }),
      leadForm: Object.freeze({
        phoneInvalid: 'Укажите корректный телефон',
        consentRequired: 'Нужно согласие на обработку данных',
        submitFailed: 'Не удалось отправить заявку',
      }),
      pdf: Object.freeze({
        fontLoadFailed: 'Не удалось загрузить шрифт для PDF: {url}',
        emptyItems: 'Невозможно сформировать КП: список позиций пуст.',
      }),
      productApi: Object.freeze({
        catalogLoadFailed: 'Не удалось загрузить каталог',
        productsLoadFailed: 'Не удалось загрузить позиции',
        relatedProductsLoadFailed: 'Не удалось загрузить похожие товары',
        suggestionsLoadFailed: 'Не удалось загрузить подсказки',
        productLoadFailed: 'Не удалось загрузить товар',
        productNotFound: 'Товар не найден',
        productNotFoundDescription:
          'Возможно, ссылка устарела или товар был удален из каталога.',
      }),
      quoteForm: Object.freeze({
        nameRequired: 'Введите имя',
        nameTooShort: 'Имя должно содержать минимум 2 символа',
        phoneRequired: 'Введите телефон',
        phoneInvalid: 'Введите корректный телефон',
        emailInvalid: 'Введите корректный email',
        emailRequiredForChannel: 'Укажите email — выбран как способ связи',
        customerCommentTooLong:
          'Комментарий не должен превышать {max} символов',
        cartEmpty: 'Корзина пуста',
        tooManyItems: 'В заявке не должно быть больше {max} позиций',
        itemCommentTooLong:
          'Комментарий к позиции не должен превышать {max} символов',
        submitFailed: 'Не удалось отправить заявку',
        submitRequestFailed: 'Ошибка отправки',
      }),
    }),
    success: Object.freeze({
      leadSent: 'Заявка отправлена',
      leadSentDetailed: 'Заявка отправлена. Мы скоро свяжемся с вами.',
      quoteSent: 'Заявка успешно отправлена',
    }),
    text: Object.freeze({
      cartManualDefaultDescription: 'Позиция добавлена вручную для запроса КП.',
      cartEmptyPromptPrefix: 'Корзина пуста. Добавьте товары из',
      cartEmptyPromptSuffix: ', чтобы сформировать запрос КП.',
      errorBoundaryReload: 'Перезагрузить страницу',
      backToCatalog: 'Вернуться в каталог',
      leadDefaultCommentPrefix: 'Короткая заявка: {source}',
    }),
  }),
});

export function getMessages(locale = DEFAULT_LOCALE) {
  return MESSAGE_DICTIONARIES[locale] || MESSAGE_DICTIONARIES[DEFAULT_LOCALE];
}

export const messages = getMessages();

export function formatMessage(template, values = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match
  );
}

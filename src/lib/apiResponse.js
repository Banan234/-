// Файл нормализует клиентскую обработку API-ответов и ошибок fetch-запросов.

const DEFAULT_API_ERROR_MESSAGE = 'Сервис временно недоступен';

function createApiError(response, result, fallbackMessage) {
  const error = new Error(result.message || fallbackMessage);
  error.status = Number(response?.status) || 0;
  error.isNotFound = error.status === 404;
  return error;
}

export async function readApiJson(response, fallbackMessage) {
  const message = fallbackMessage || DEFAULT_API_ERROR_MESSAGE;

  if (typeof response.text !== 'function') {
    try {
      const parsed = await response.json();
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new Error(message);
    }
  }

  let text = '';

  try {
    text = await response.text();
  } catch {
    throw new Error(message);
  }

  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error(message);
  }
}

export async function expectOkApiJson(response, fallbackMessage) {
  const message = fallbackMessage || DEFAULT_API_ERROR_MESSAGE;
  const result = await readApiJson(response, message);

  if (!response.ok || !result.ok) {
    throw createApiError(response, result, message);
  }

  return result;
}

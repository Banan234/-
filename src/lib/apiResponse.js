const DEFAULT_API_ERROR_MESSAGE = 'Сервис временно недоступен';

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
    throw new Error(result.message || message);
  }

  return result;
}

export const META_DESCRIPTION_MAX_LENGTH = 160;

export function normalizeMetaDescription(
  value,
  { maxLength = META_DESCRIPTION_MAX_LENGTH } = {}
) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  const suffix = '...';
  const sliceLength = Math.max(0, maxLength - suffix.length);
  const head = normalized.slice(0, sliceLength);
  const lastSpaceIndex = head.lastIndexOf(' ');
  const shouldCutOnWord = lastSpaceIndex >= Math.floor(sliceLength * 0.6);
  const trimmed = (shouldCutOnWord ? head.slice(0, lastSpaceIndex) : head)
    .replace(/[.,;:!?-]+$/u, '')
    .trimEnd();

  return `${trimmed}${suffix}`;
}

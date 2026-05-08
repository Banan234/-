export const POWER_CABLE_GROUPS = [
  'Бумажная изоляция',
  'ВВГ / бронированные',
  'Сшитый полиэтилен (XLPE)',
];

const GROUP_MARKS = {
  'Бумажная изоляция': [
    'ААБ2л',
    'ААБ2лШв',
    'ААБл',
    'ААБлГ',
    'ААБнлГ',
    'ААСШв',
    'ААШ',
    'ААШв',
    'АСБ',
    'АСБ2л',
    'АСБГ',
    'АСБл',
    'ЦААШВ',
    'ЦАСБ',
    'ЦАСБ2л',
  ],
  'ВВГ / бронированные': [
    'АВБбШ',
    'АВБбШв',
    'АВбШв',
    'АВБШВв',
    'АВВГ',
    'АсВВГ',
    'ВБбШ',
    'ВБбШВ',
    'ВБВ',
    'ВБШВ',
    'ВВГ',
    'ВРГ',
    'ВЭБШВ',
    'ПВВ',
    'ПВВГ',
    'ППГ',
  ],
  'Сшитый полиэтилен (XLPE)': [
    'АПвБбШв',
    'АПвБбШп',
    'АПвБВ',
    'АПвБП',
    'АПвБШв',
    'АПвБШп',
    'АПвВ',
    'АПвВГ',
    'АПвзБбШп',
    'АПвКаПг',
    'АПвП',
    'АПвПг',
    'АПвПу',
    'АПвПу2Г',
    'АПвПу2Гж',
    'АПвПуГ',
    'АПвЭАСПУ2Г',
    'АПвЭБВ',
    'ПвБВ',
    'ПвБП',
    'ПвБШВ',
    'ПвБШП',
    'ПвзБбШп',
    'ПвП',
    'ПвПГ',
  ],
};

function normalizeSpaces(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupKey(value) {
  return normalizePowerCableBaseMark(value).replace(/\s+/g, '').toUpperCase();
}

export function normalizePowerCableBaseMark(value) {
  return normalizeSpaces(value)
    .replace(/нг.*$/iu, '')
    .replace(/\s*\(г\)\s*$/iu, '')
    .replace(/\s+з$/iu, '')
    .replace(/\s*-\s*\d+(?:[.,]\d+)?\s*$/u, '')
    .trim();
}

const POWER_CABLE_GROUP_BY_MARK = new Map(
  Object.entries(GROUP_MARKS).flatMap(([group, marks]) =>
    marks.map((mark) => [normalizeLookupKey(mark), group])
  )
);

export function getPowerCableGroup(productOrMark) {
  const mark =
    typeof productOrMark === 'string'
      ? productOrMark
      : productOrMark?.mark || productOrMark?.markFamily || '';

  if (!mark) {
    return null;
  }

  return POWER_CABLE_GROUP_BY_MARK.get(normalizeLookupKey(mark)) || null;
}

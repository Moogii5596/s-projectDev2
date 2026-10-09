/** DTO туслахууд (class-transformer) */
export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Хоосон string → null (заавал биш талбарыг арилгах) */
export const trimOrNull = ({ value }: { value: unknown }) => {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
export const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

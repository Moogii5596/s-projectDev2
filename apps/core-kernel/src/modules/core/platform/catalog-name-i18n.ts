import { Prisma } from '@prisma/client';

type CatalogNameI18nInput = { en?: string; zh?: string };
type Locale = 'mn' | keyof CatalogNameI18nInput;
export type CatalogNameTranslations = Partial<Record<'mn' | 'en' | 'zh', string>>;

function readName(previous: Prisma.JsonValue | null | undefined, locale: Locale): string | undefined {
  if (previous === null || previous === undefined || Array.isArray(previous) || typeof previous !== 'object') return undefined;
  const value = previous[locale];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function readCatalogNameI18n(value: Prisma.JsonValue | null | undefined): CatalogNameTranslations {
  const mn = readName(value, 'mn');
  const en = readName(value, 'en');
  const zh = readName(value, 'zh');
  return {
    ...(mn ? { mn } : {}),
    ...(en ? { en } : {}),
    ...(zh ? { zh } : {}),
  };
}

export function mergeCatalogNameI18n(
  name: string,
  previous?: Prisma.JsonValue | null,
  updates?: CatalogNameI18nInput,
): Prisma.InputJsonObject {
  const en = updates?.en === undefined ? readName(previous, 'en') : updates.en.trim();
  const zh = updates?.zh === undefined ? readName(previous, 'zh') : updates.zh.trim();
  return {
    mn: name,
    ...(en ? { en } : {}),
    ...(zh ? { zh } : {}),
  };
}

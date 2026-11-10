import { describe, expect, it } from 'vitest';
import { mergeCatalogNameI18n, readCatalogNameI18n } from '../catalog-name-i18n';

describe('catalog name translations', () => {
  it('keeps translations that were not included in an update', () => {
    expect(mergeCatalogNameI18n('Хэлтэс', { mn: 'Хэлтэс', en: 'Department', zh: '部门' }, { en: 'Division' })).toEqual({
      mn: 'Хэлтэс',
      en: 'Division',
      zh: '部门',
    });
  });

  it('removes blank translations and reads only non-empty locale strings', () => {
    expect(mergeCatalogNameI18n('Алба', { en: 'Office', zh: '部门' }, { en: '  ', zh: ' 部门 ' })).toEqual({
      mn: 'Алба',
      zh: '部门',
    });
    expect(readCatalogNameI18n({ mn: 'Алба', en: '', zh: '部门', invalid: true })).toEqual({ mn: 'Алба', zh: '部门' });
  });
});

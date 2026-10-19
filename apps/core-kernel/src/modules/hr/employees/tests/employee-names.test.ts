import { describe, expect, it } from 'vitest';
import { joinFullName, normalizeExtraPhones, resolveNames, splitFullName, splitPhones } from '../employee-names';

describe('v0.2.3 Блок D — employee-names', () => {
  it('splitFullName: эхний зай = овог | нэр; нэг үг = нэр; илүү зай', () => {
    expect(splitFullName('  Хүрлээ   Анх баяр ')).toEqual({ lastName: 'Хүрлээ', firstName: 'Анх баяр' });
    expect(splitFullName('Li')).toEqual({ lastName: null, firstName: 'Li' });
    expect(joinFullName(null, 'Li')).toBe('Li');
  });

  it('resolveNames: хэсгүүд > бүтэн нэр; одоогийнхоос нөхнө; юу ч өгөөгүй → null', () => {
    const cur = { familyName: 'Боржигон', lastName: 'Бат', firstName: 'Дорж', fullName: 'Бат Дорж' };
    expect(resolveNames({}, cur)).toBeNull();
    expect(resolveNames({ firstName: 'Сүх' }, cur)).toEqual({ familyName: 'Боржигон', lastName: 'Бат', firstName: 'Сүх', fullName: 'Бат Сүх' });
    expect(resolveNames({ lastName: null }, cur)).toMatchObject({ lastName: null, fullName: 'Дорж' });
    expect(resolveNames({ fullName: 'Ганзориг Мөнхдорж', lastName: null }, cur)).toMatchObject({ lastName: 'Ганзориг', firstName: 'Мөнхдорж' });
    expect(resolveNames({ fullName: 'Бүтэн Нэр', firstName: 'Нэр', lastName: 'Овог' })).toMatchObject({ fullName: 'Овог Нэр' });
    expect(resolveNames({ familyName: ' ' }, cur)).toMatchObject({ familyName: null, fullName: 'Бат Дорж' });
  });

  it('splitPhones + normalizeExtraPhones: таслал/мөр/олон зай; давхардал, үндсэнтэй давхцал хасна', () => {
    expect(splitPhones('99633199\n80788684')).toEqual(['99633199', '80788684']);
    expect(splitPhones('80554025, \n86563838')).toEqual(['80554025', '86563838']);
    expect(splitPhones('85158495                       99327395    ')).toEqual(['85158495', '99327395']);
    expect(splitPhones('88977999 88454433')).toEqual(['88977999', '88454433']);
    expect(splitPhones('+976 9911 2233')).toEqual(['+97699112233']);
    expect(splitPhones(null)).toEqual([]);
    expect(normalizeExtraPhones(['9911 2233', '88123354', '88123354'], '99112233')).toEqual(['88123354']);
  });
});

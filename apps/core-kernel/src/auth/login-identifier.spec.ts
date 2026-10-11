import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeMnPhone, parseLoginIdentifier, usernameFromCode } from './login-identifier';

describe('login-identifier (v0.2.2 D-13)', () => {
  it('normalizeMnPhone: зай/зураас/+976/00976; гадаад, буруу урт → null', () => {
    expect(normalizeMnPhone('9911 2233')).toBe('99112233');
    expect(normalizeMnPhone('99-11-22-33')).toBe('99112233');
    expect(normalizeMnPhone('+976 9911-2233')).toBe('99112233');
    expect(normalizeMnPhone('97699112233')).toBe('99112233');
    expect(normalizeMnPhone('0097699112233')).toBe('99112233');
    expect(normalizeMnPhone('+86 138 0013 8000')).toBeNull();
    expect(normalizeMnPhone('13800138000')).toBeNull();
    expect(normalizeMnPhone('9911223')).toBeNull();
    expect(normalizeMnPhone('99ab2233')).toBeNull();
    expect(normalizeMnPhone('')).toBeNull();
    expect(normalizeMnPhone(null)).toBeNull();
  });

  it('parseLoginIdentifier: имэйл (жижиг үсэг) / утас / username; хоосон, буруу → null', () => {
    expect(parseLoginIdentifier('  Bat@Example.MN ')).toEqual({ kind: 'email', value: 'bat@example.mn' });
    expect(parseLoginIdentifier('+976 99112233')).toEqual({ kind: 'phone', value: '99112233' });
    expect(parseLoginIdentifier('SH1023')).toEqual({ kind: 'username', value: 'sh1023' });
    expect(parseLoginIdentifier('wang.li')).toEqual({ kind: 'username', value: 'wang.li' });
    expect(parseLoginIdentifier('Бат')).toBeNull();
    expect(parseLoginIdentifier('')).toBeNull();
    expect(parseLoginIdentifier('a b')).toBeNull();
  });

  it('usernameFromCode: кирилл/зай хасна, давхардвал -2, богино бол fallback', () => {
    expect(usernameFromCode('SH-1023', new Set(), 'x')).toBe('sh-1023');
    expect(usernameFromCode('АБ 1023', new Set(), 'x')).toBe('1023');
    expect(usernameFromCode('sh1023', new Set(['sh1023', 'sh1023-2']), 'x')).toBe('sh1023-3');
    expect(usernameFromCode('Б', new Set(), '0190a1b2-c3d4')).toBe('u0190a1b2c3d4');
    expect(usernameFromCode('_x9', new Set(), 'f')).toBe('x9');
  });

  it('maskPhone', () => {
    expect(maskPhone('99112233')).toBe('99****33');
  });
});

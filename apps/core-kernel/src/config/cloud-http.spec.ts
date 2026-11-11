import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, parseTrustProxy } from './cloud-http';

describe('cloud-http (v0.2.5 H3)', () => {
  it('TRUST_PROXY: хоосон/false → false; true; hop тоо; IP жагсаалт', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy(' ')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual(['10.0.0.0/8', '127.0.0.1']);
  });

  it('CORS_ORIGINS: таслалаар, төгсгөлийн / хасна; wildcard/зам → алдаа', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('https://a.example.com/, https://b.example.com')).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(() => parseCorsOrigins('*')).toThrow(/CORS_ORIGINS/);
    expect(() => parseCorsOrigins('https://*.vercel.app')).toThrow(/CORS_ORIGINS/);
    expect(() => parseCorsOrigins('https://a.example.com/app')).toThrow(/CORS_ORIGINS/);
  });
});

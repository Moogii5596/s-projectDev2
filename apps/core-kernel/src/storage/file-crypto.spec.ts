import { describe, expect, it } from 'vitest';
import { decryptFile, detectFileType, encryptFile, resolveFileKey, safeFileName } from './file-crypto';

const env = { JWT_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('file-crypto (FILE-01, M-7)', () => {
  it('AES-256-GCM: тайлж эх файлыг буцаана; диск дээр эх байт харагдахгүй', () => {
    const key = resolveFileKey(env);
    const plain = Buffer.from('нууц баримт '.repeat(20));
    const enc = encryptFile(plain, key);
    expect(enc.includes(plain.subarray(0, 12))).toBe(false);
    expect(decryptFile(enc, key)).toEqual(plain);
  });

  it('буруу түлхүүр, өөрчилсөн байт → алдаа', () => {
    const key = resolveFileKey(env);
    const enc = encryptFile(Buffer.from('abc'), key);
    const other = resolveFileKey({ FILE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') } as NodeJS.ProcessEnv);
    expect(() => decryptFile(enc, other)).toThrow();
    enc[enc.length - 1] ^= 1;
    expect(() => decryptFile(enc, key)).toThrow();
  });

  it('FILE_ENCRYPTION_KEY 32 байт биш бол эхлэхэд унана; keyId тогтвортой', () => {
    expect(() => resolveFileKey({ FILE_ENCRYPTION_KEY: 'c2hvcnQ=' } as NodeJS.ProcessEnv)).toThrow(/32/);
    expect(resolveFileKey(env).id).toBe(resolveFileKey(env).id);
    expect(resolveFileKey(env).derived).toBe(true);
  });

  it('төрлийг байтаар тогтооно — өргөтгөл хуурвал хүлээхгүй', () => {
    expect(detectFileType(PNG, 'a.png')).toBe('image/png');
    expect(detectFileType(Buffer.from('%PDF-1.7'), 'x.pdf')).toBe('application/pdf');
    expect(detectFileType(Buffer.from('<script>'), 'evil.pdf')).toBeNull();
    expect(detectFileType(Buffer.from('a,b\n1,2'), 'r.csv')).toBe('text/csv');
    expect(detectFileType(Buffer.from([0x50, 0x4b, 3, 4]), 'a.zip')).toBeNull();
    expect(detectFileType(Buffer.from([0x50, 0x4b, 3, 4]), 'a.xlsx')).toMatch(/spreadsheetml/);
  });

  it('файлын нэрийн зам, хяналтын тэмдэгтийг арилгана', () => {
    expect(safeFileName('..\\..\\etc/passwd')).toBe('passwd');
    expect(safeFileName('акт\u0000"1".pdf')).toBe('акт__1_.pdf');
  });
});

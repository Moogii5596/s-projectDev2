/**
 * v0.1.6 (B2) — VITE_MODULES / нүүр зам / same-origin Supabase URL
 */
import { describe, expect, it } from 'vitest';
import { APP_MODULES, homePath, parseModules, resolveSupabaseUrl } from '../modules';

describe('parseModules', () => {
  it('хоосон / all → бүх модуль', () => {
    expect([...parseModules(undefined)]).toEqual([...APP_MODULES]);
    expect([...parseModules(' ALL ')]).toEqual([...APP_MODULES]);
  });

  it('camp → кемп + hr (v0.2.2 H2 хамаарал); таслалаар олон', () => {
    expect([...parseModules('camp')]).toEqual(['camp', 'hr']);
    expect([...parseModules(' Camp , reports ')]).toEqual(['camp', 'reports', 'hr']);
  });

  it('hr дангаараа → зөвхөн hr (кемпийг асаахгүй)', () => {
    expect([...parseModules('hr')]).toEqual(['hr']);
    expect([...parseModules('hr,camp')]).toEqual(['hr', 'camp']);
  });

  it('үл мэдэгдэх модуль → алдаа (бичгийн алдааг чимээгүй өнгөрөөхгүй)', () => {
    expect(() => parseModules('camp,kemp')).toThrow(/kemp/);
  });
});

describe('homePath', () => {
  it('бүгд → /requisitions (өмнөх зан төлөв), camp → /camp', () => {
    expect(homePath(parseModules(''))).toBe('/requisitions');
    expect(homePath(parseModules('camp'))).toBe('/camp');
    expect(homePath(parseModules('reports,camp'))).toBe('/camp');
  });

  it('H2: camp асаахад нүүр /camp хэвээр (hr нүүр болохгүй); зөвхөн hr → /hr', () => {
    expect(homePath(parseModules('camp'))).toBe('/camp');
    expect(homePath(parseModules('hr'))).toBe('/hr');
  });

  it('зөвхөн mfe → алдаа', () => {
    expect(() => homePath(parseModules('mfe'))).toThrow(/үндсэн модуль/);
  });
});

describe('resolveSupabaseUrl', () => {
  it('same-origin → origin; бусад нь хэвээр', () => {
    expect(resolveSupabaseUrl('same-origin', 'https://pilot.example.ts.net')).toBe('https://pilot.example.ts.net');
    expect(resolveSupabaseUrl(' http://localhost:54321 ', 'x')).toBe('http://localhost:54321');
    expect(resolveSupabaseUrl(undefined, 'x')).toBe('');
  });
});

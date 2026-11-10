import { describe, it, expect, beforeAll } from 'vitest'
import i18n from '../../../../i18n'
import type { AssetMovement, PositionSetting, Stay } from '../../api/types'
import { decodeLocation, movementFrom, movementTo, roomLabel } from '../asset-location'
import { inherited } from '../effective'
import { filterStays } from '../stays'
import { localizedCatalogName } from '../../../../core/labels'

beforeAll(async () => {
  await i18n.changeLanguage('mn')
})

const stay = (code: string, group: Stay['shiftGroup'], dept: string, position: string | null): Stay => ({
  id: code,
  startDate: '2026-10-01',
  endDate: null,
  dayType: 'FULL_DAY',
  shiftGroup: group,
  positionName: position,
  mealsIncluded: true,
  employee: { id: code, employeeCode: code, fullName: `Нэр ${code}`, department: { code: dept, name: dept }, crew: null },
})

describe('v0.2.1 filterStays (C-14)', () => {
  const rows = [stay('E1', 'DAY', 'MINE', 'Жолооч'), stay('E2', 'NIGHT', 'MINE', 'Ахлах  жолооч'), stay('E3', 'NIGHT', 'ADM', null), stay('E4', 'MOVEMENT', 'ADM', 'Тогооч')]
  const none = { group: '' as const, departmentCode: '', position: '', q: '' }
  it('ээлж, хэлтэс, албан тушаал (хэсэгчилсэн, зай/үсэг үл хамаарна), код/нэрээр', () => {
    expect(filterStays(rows, { ...none, group: 'NIGHT' }).map((s) => s.id)).toEqual(['E2', 'E3'])
    expect(filterStays(rows, { ...none, group: 'NIGHT', departmentCode: 'MINE' }).map((s) => s.id)).toEqual(['E2'])
    expect(filterStays(rows, { ...none, position: 'ахлах ЖОЛООЧ' }).map((s) => s.id)).toEqual(['E2'])
    expect(filterStays(rows, { ...none, position: 'жолооч' }).map((s) => s.id)).toEqual(['E1', 'E2'])
    expect(filterStays(rows, { ...none, q: 'e4' }).map((s) => s.id)).toEqual(['E4'])
    expect(filterStays(rows, none)).toHaveLength(4)
  })
})

describe('v0.2.1 хөрөнгийн байршил (C-12)', () => {
  it('decodeLocation: агуулах / өрөө / байр', () => {
    expect(decodeLocation('')).toEqual({ roomId: null, buildingId: null })
    expect(decodeLocation('r:abc')).toEqual({ roomId: 'abc', buildingId: null })
    expect(decodeLocation('b:xyz')).toEqual({ roomId: null, buildingId: 'xyz' })
  })
  it('roomLabel / movement: өрөө > байр > агуулах', () => {
    expect(roomLabel({ room: { roomNo: '101', building: { code: 'B1' } }, building: null })).toBe('B1-101')
    expect(roomLabel({ room: null, building: { code: 'B2' } })).toBe('B2 (байранд)')
    expect(roomLabel({ room: null })).toBe(i18n.t('camp.asset.warehouse'))
    const h = { fromRoom: { roomNo: '101', building: { code: 'B1' } }, toRoom: null, fromBuilding: null, toBuilding: { code: 'B2' } } as unknown as AssetMovement
    expect([movementFrom(h), movementTo(h)]).toEqual(['B1-101', 'B2 (байранд)'])
  })
})

describe('v0.2.1 inherited (Q1): албан тушаал(кемп) ?? кемпийн анхдагч', () => {
  const ps: PositionSetting[] = [
    { positionId: 'p1', name: 'Харуул', isActive: true, activeEmployees: 1, mealLocationId: 'l2', mealLocationName: 'Пост', mealsIncluded: false, shiftPattern: [] },
    { positionId: 'p2', name: 'Тогооч', isActive: true, activeEmployees: 1, mealLocationId: null, mealLocationName: null, mealsIncluded: null, shiftPattern: [] },
  ]
  const def = { id: 'l1', name: 'Кемп', isActive: true } as never
  it('албан тушаалд утгатай → POSITION; утгагүй / албан тушаалгүй → DEFAULT', () => {
    expect(inherited('p1', ps, def)).toEqual({ locationName: 'Пост', mealsIncluded: false, from: 'POSITION' })
    expect(inherited('p2', ps, def)).toEqual({ locationName: 'Кемп', mealsIncluded: true, from: 'DEFAULT' })
    expect(inherited(null, ps, def)).toEqual({ locationName: 'Кемп', mealsIncluded: true, from: 'DEFAULT' })
    expect(inherited('p1', undefined, undefined)).toEqual({ locationName: null, mealsIncluded: true, from: 'DEFAULT' })
  })
})

describe('localized catalog names', () => {
  const entry = { name: 'Хэлтэс', nameI18n: { en: 'Department', zh: '部门' } }

  it('uses the requested language and falls back to the default name', () => {
    expect(localizedCatalogName(entry, 'en-US')).toBe('Department')
    expect(localizedCatalogName(entry, 'zh-CN')).toBe('部门')
    expect(localizedCatalogName(entry, 'mn')).toBe('Хэлтэс')
    expect(localizedCatalogName({ name: 'Хэлтэс' }, 'en')).toBe('Хэлтэс')
  })
})

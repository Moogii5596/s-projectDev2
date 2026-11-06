import { describe, expect, it } from 'vitest'
import { assignedRoleIds, directPermissionCodes } from '../granted'

describe('granted (PIL-18)', () => {
  const rows = [
    { user: { id: 'u1' }, role: { id: 'r1' }, camp: null, sourcePositionId: null },
    { user: { id: 'u1' }, role: { id: 'r2' }, camp: { id: 'c1' } },
    { user: { id: 'u1' }, role: { id: 'r3' }, camp: { id: 'c1' }, sourcePositionId: 'pos1' },
    { user: { id: 'u2' }, role: { id: 'r4' }, camp: { id: 'c1' }, sourcePositionId: null },
  ]
  it('assignedRoleIds: хэрэглэгч + хүрээгээр, автомат олголтыг тооцохгүй', () => {
    expect([...assignedRoleIds(rows, 'u1', '')]).toEqual(['r1'])
    expect([...assignedRoleIds(rows, 'u1', 'c1')]).toEqual(['r2'])
    expect([...assignedRoleIds(rows, 'u3', 'c1')]).toEqual([])
  })
  it('directPermissionCodes: зөвхөн DIRECT, ижил хүрээ', () => {
    const perms = [
      { permissionCode: 'hr.shift.adjust', campId: null, source: 'DIRECT' },
      { permissionCode: 'camp.room.manage', campId: 'c1', source: 'DIRECT' },
      { permissionCode: 'camp.asset.manage', campId: null, source: 'TEMPLATE' },
    ]
    expect([...directPermissionCodes(perms, '')]).toEqual(['hr.shift.adjust'])
    expect([...directPermissionCodes(perms, 'c1')]).toEqual(['camp.room.manage'])
  })
})

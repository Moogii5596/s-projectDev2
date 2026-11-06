/**
 * v0.2.2 Блок 4 — урилгын линк, нэвтрэх нэр, төлөв, шүүлт, эрхийн харагдац
 */
import { describe, expect, it } from 'vitest'
import type { CampUser, UserPermissions } from '../../../camp/api/types'
import { filterUsers, inviteLink, loginName, outdatedAssignments, permissionView, userState } from '../user-access'

const user = (o: Partial<CampUser> = {}): CampUser => ({
  id: 'u1',
  email: 'u-1@sino.login.invalid',
  fullName: 'Бат',
  isActive: true,
  role: 'REQUESTER',
  phone: '99112233',
  username: null,
  internalEmail: true,
  employee: { id: 'e1', employeeCode: 'E001', fullName: 'Бат', campId: 'c1', campCode: 'K1' },
  invite: null,
  lastSignInAt: null,
  ...o,
})

const inv = (status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED') => ({ status, channel: 'LINK' as const, expiresAt: '', createdAt: '' })

describe('inviteLink', () => {
  it('url байвал түүнийг, эс бөгөөс origin + path', () => {
    expect(inviteLink({ url: 'https://sino.gobiverse.website/invite/x', path: '/invite/x' }, 'http://localhost')).toBe('https://sino.gobiverse.website/invite/x')
    expect(inviteLink({ url: null, path: '/invite/x' }, 'http://localhost:5173/')).toBe('http://localhost:5173/invite/x')
    expect(inviteLink({ url: null, path: null }, 'http://x')).toBeNull()
  })
})

describe('loginName', () => {
  it('утас → username → бодит имэйл; дотоод имэйл харагдахгүй', () => {
    expect(loginName(user())).toBe('99112233')
    expect(loginName(user({ phone: null, username: 'li.wei' }))).toBe('li.wei')
    expect(loginName(user({ phone: null }))).toBeNull()
    expect(loginName(user({ phone: null, email: 'a@b.mn', internalEmail: false }))).toBe('a@b.mn')
  })
})

describe('userState', () => {
  it('идэвхгүй > хүлээгдэж буй урилга > ашигласан; хуучин имэйл хэрэглэгч = идэвхтэй', () => {
    expect(userState(user({ isActive: false, invite: inv('PENDING') }))).toBe('INACTIVE')
    expect(userState(user({ invite: inv('PENDING') }))).toBe('INVITED')
    expect(userState(user({ invite: inv('USED') }))).toBe('ACTIVE')
    expect(userState(user({ invite: inv('EXPIRED') }))).toBe('NO_INVITE')
    expect(userState(user())).toBe('NO_INVITE')
    expect(userState(user({ internalEmail: false, email: 'a@b.mn' }))).toBe('ACTIVE')
  })

  it('filterUsers: нэр/утас/ажилтны кодоор, төлөвөөр', () => {
    const list = [user(), user({ id: 'u2', fullName: 'Дорж', phone: '88001122', employee: null, invite: inv('PENDING') })]
    expect(filterUsers(list, 'e001', '').map((u) => u.id)).toEqual(['u1'])
    expect(filterUsers(list, '8800', '').map((u) => u.id)).toEqual(['u2'])
    expect(filterUsers(list, '', 'INVITED').map((u) => u.id)).toEqual(['u2'])
    expect(filterUsers(list, 'login.invalid', '')).toEqual([])
  })
})

describe('permissionView', () => {
  const data: UserPermissions = {
    user: { id: 'u1', email: '', fullName: null, isActive: true },
    permissions: [
      { id: 'p1', permissionCode: 'camp.room.manage', campId: null, source: 'TEMPLATE', userRoleId: 'r1', role: { id: 'R', name: 'Кемп админ' }, createdAt: '' },
      { id: 'p2', permissionCode: 'camp.employee.manage', campId: 'c1', source: 'DIRECT', userRoleId: null, role: null, createdAt: '' },
      { id: 'p3', permissionCode: 'camp.room.manage', campId: 'c1', source: 'DIRECT', userRoleId: null, role: null, createdAt: '' },
    ],
    assignments: [
      { userRoleId: 'r1', campId: null, role: { id: 'R', name: 'Кемп админ' }, outdated: true, add: ['camp.asset.manage'], remove: [] },
      { userRoleId: 'r2', campId: 'c1', role: { id: 'Q', name: 'Х' }, outdated: false, add: [], remove: [] },
    ],
  }

  it('эрх бүрээр бүлэглэж каталогийн дарааллаар; загвар/шууд тусдаа', () => {
    const v = permissionView(data, ['camp.employee.manage', 'camp.room.manage'])
    expect(v.map((x) => x.code)).toEqual(['camp.employee.manage', 'camp.room.manage'])
    expect(v[1]).toEqual({ code: 'camp.room.manage', template: [{ roleName: 'Кемп админ', campId: null }], direct: [{ id: 'p3', campId: 'c1' }] })
  })

  it('загвараас зөрүүтэй олголт', () => {
    expect(outdatedAssignments(data).map((a) => a.userRoleId)).toEqual(['r1'])
  })
})

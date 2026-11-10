import { hrApi } from '../../hr/api/hr-api'

export { default as EmployeePicker } from '../../hr/components/EmployeePicker'
export type { PickedEmployee } from '../../hr/components/EmployeePicker'
export { default as LegacyHrRedirect } from '../../hr/components/LegacyHrRedirect'

export const campHrBridge = {
  exportRoomFile: (campId: string) => hrApi.exportFile(campId, 'rooms'),
}

import { MrStatus } from '../types/mr.types'

const config: Record<MrStatus, { label: string; className: string }> = {
  [MrStatus.DRAFT]: {
    label: 'Ноорог',
    className: 'bg-gray-100 text-gray-700',
  },
  [MrStatus.PENDING_APPROVAL]: {
    label: 'Батлуулж байна',
    className: 'bg-yellow-100 text-yellow-700',
  },
  [MrStatus.APPROVED]: {
    label: 'Батлагдсан',
    className: 'bg-green-100 text-green-700',
  },
  [MrStatus.REJECTED]: {
    label: 'Татгалзсан',
    className: 'bg-red-100 text-red-700',
  },
}

interface Props {
  status: MrStatus
}

export default function StatusBadge({ status }: Props) {
  const { label, className } = config[status] ?? config[MrStatus.DRAFT]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

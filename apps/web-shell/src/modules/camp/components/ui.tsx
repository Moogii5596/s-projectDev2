import { useEffect, useId, type ReactNode } from 'react'
import { apiErrorMessage } from '../lib/errors'

/* Кемп модулийн жижиг UI хэрэгслүүд — web-shell-ийн Tailwind хэв маягтай (gray/blue). Шинэ сан нэмэхгүй. */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-blue-600 hover:underline disabled:text-gray-400',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  const pad = variant === 'ghost' ? '' : size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`${BTN[variant]} ${pad} rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${className}`}
    >
      {loading ? 'Түр хүлээнэ үү…' : children}
    </button>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 bg-white rounded-xl border border-gray-200 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Шошготой талбар — label ↔ input холбогдсон (хүртээмж, e2e getByLabel) */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

const inputBase =
  'rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-50'
export const inputCls = `w-full py-2 ${inputBase}`
/** Карт толгойн жижиг шүүлт/хайлт (өргөнийг дуудагч өгнө) */
export const inputSmCls = `py-1 ${inputBase}`

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue'; children: ReactNode }) {
  const t = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
  }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>
}

export function Loading({ text = 'Уншиж байна…' }: { text?: string }) {
  return <div className="py-10 text-center text-sm text-gray-400">{text}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-gray-400">{children}</div>
}

/** API алдаа (backend-ийн мессежийг шууд) */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm flex items-center justify-between gap-3">
      <span>{apiErrorMessage(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline shrink-0">
          Дахин оролдох
        </button>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mt-12 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-white shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Хаах" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  )
}

/** Хүснэгтийн бүрхүүл — гар утсан дээр хажуу тийш гүйлгэнэ */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

export const td = 'px-3 py-2 align-middle'

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="green">Идэвхтэй</Badge> : <Badge>Идэвхгүй</Badge>
}

/** Эрхгүй үед харуулах */
export function NoAccess({ what }: { what: string }) {
  return <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">{what}: энэ хэсэгт хандах эрх алга.</div>
}

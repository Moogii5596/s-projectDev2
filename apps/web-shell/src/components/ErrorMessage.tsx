interface Props {
  message?: string
  onRetry?: () => void
}

export default function ErrorMessage({ message = 'Алдаа гарлаа', onRetry }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm flex items-center justify-between">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-4 underline text-red-600 hover:text-red-700">
          Дахин оролдох
        </button>
      )}
    </div>
  )
}

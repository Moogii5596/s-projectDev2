export default function LoadingSpinner({ message = 'Уншиж байна...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-gray-400 text-sm">{message}</div>
    </div>
  )
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="p-4 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
      {message}
    </div>
  )
}

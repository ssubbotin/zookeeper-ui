export default function ServerInfo({ info, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    )
  }

  if (!info) return null

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            info.connected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className={info.connected ? 'text-green-700' : 'text-red-700'}>
          {info.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="text-gray-500">
        {info.connectionString}
      </div>
      {info.messageTypesCount > 0 && (
        <div className="text-gray-500">
          {info.messageTypesCount} proto types
        </div>
      )}
    </div>
  )
}

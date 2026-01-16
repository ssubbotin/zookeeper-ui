import { useState } from 'react'
import { encodeData } from '../api/zookeeper'

export default function EditNodeModal({ path, initialData, decoded, messageType, onClose, onSubmit }) {
  // If we have decoded protobuf data, default to protobuf mode
  const hasProtobuf = decoded && messageType
  const [mode, setMode] = useState(hasProtobuf ? 'protobuf' : 'raw')
  const [rawData, setRawData] = useState(initialData || '')
  const [jsonData, setJsonData] = useState(hasProtobuf ? JSON.stringify(decoded, null, 2) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    setLoading(true)
    setError(null)
    try {
      if (mode === 'protobuf') {
        // Parse JSON and encode to protobuf
        let parsedData
        try {
          parsedData = JSON.parse(jsonData)
        } catch (parseErr) {
          throw new Error('Invalid JSON: ' + parseErr.message)
        }

        const { dataHex } = await encodeData(parsedData, messageType)
        await onSubmit(path, null, dataHex)
      } else {
        // Save as raw string
        await onSubmit(path, rawData, null)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-medium">Edit Node</h3>
          <p className="text-sm text-gray-500 mt-1">
            Path: <code className="bg-gray-100 px-1 rounded">{path}</code>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-4 space-y-4 flex-1 min-h-0 flex flex-col">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
                {error}
              </div>
            )}

            {hasProtobuf && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMode('protobuf')}
                  className={`px-3 py-1.5 text-sm rounded ${
                    mode === 'protobuf'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Protobuf ({messageType.split('.').pop()})
                </button>
                <button
                  type="button"
                  onClick={() => setMode('raw')}
                  className={`px-3 py-1.5 text-sm rounded ${
                    mode === 'raw'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Raw Text
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1 flex-shrink-0">
                {mode === 'protobuf' ? 'JSON Data' : 'Data'}
              </label>
              <textarea
                value={mode === 'protobuf' ? jsonData : rawData}
                onChange={(e) => mode === 'protobuf' ? setJsonData(e.target.value) : setRawData(e.target.value)}
                placeholder={mode === 'protobuf' ? 'JSON data...' : 'Node data...'}
                className="w-full flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm resize-none"
                autoFocus
              />
              {mode === 'protobuf' && (
                <p className="text-xs text-gray-500 mt-1 flex-shrink-0">
                  Edit the JSON and it will be encoded as {messageType}
                </p>
              )}
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

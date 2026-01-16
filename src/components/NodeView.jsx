import { useState, useEffect } from 'react'
import { getNode, getProtos, decodeData } from '../api/zookeeper'

function DataTab({ node, onDecode }) {
  const [viewMode, setViewMode] = useState('string') // string, hex, json

  if (!node.data && !node.dataHex) {
    return <div className="p-4 text-gray-500">No data</div>
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">View as:</span>
        <div className="flex gap-1">
          {['string', 'hex', 'json'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              disabled={mode === 'json' && !node.isJson}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === mode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        {node.dataHex && (
          <button
            onClick={onDecode}
            className="ml-auto px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Decode Protobuf
          </button>
        )}
      </div>

      <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm font-mono max-h-96">
        {viewMode === 'hex' && node.dataHex}
        {viewMode === 'string' && (node.data || '(binary data)')}
        {viewMode === 'json' && node.isJson && JSON.stringify(node.jsonData, null, 2)}
      </pre>

      <div className="mt-2 text-xs text-gray-500">
        {node.stat.dataLength} bytes
      </div>
    </div>
  )
}

function DecodedTab({ node, messageTypes, pathMappings }) {
  const [selectedType, setSelectedType] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Auto-select type based on path mapping
  useEffect(() => {
    if (!selectedType && pathMappings.length > 0) {
      const mapping = pathMappings.find(m => node.path.startsWith(m.path))
      if (mapping) {
        setSelectedType(mapping.type)
      }
    }
  }, [node.path, pathMappings, selectedType])

  const handleDecode = async () => {
    if (!selectedType || !node.dataHex) return

    setLoading(true)
    setError(null)
    try {
      const result = await decodeData(node.dataHex, selectedType, node.path)
      setDecoded(result.decoded)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!node.dataHex) {
    return <div className="p-4 text-gray-500">No data to decode</div>
  }

  if (messageTypes.length === 0) {
    return (
      <div className="p-4 text-gray-500">
        No .proto files loaded. Mount your .proto files to the protos/ directory.
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Select message type...</option>
          {messageTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          onClick={handleDecode}
          disabled={!selectedType || loading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Decoding...' : 'Decode'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {decoded && (
        <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm font-mono max-h-96">
          {JSON.stringify(decoded, null, 2)}
        </pre>
      )}
    </div>
  )
}

function StatTab({ stat }) {
  const statFields = [
    { label: 'Created', value: stat.ctime },
    { label: 'Modified', value: stat.mtime },
    { label: 'Version', value: stat.version },
    { label: 'Children Version', value: stat.cversion },
    { label: 'ACL Version', value: stat.aversion },
    { label: 'Data Length', value: `${stat.dataLength} bytes` },
    { label: 'Num Children', value: stat.numChildren },
    { label: 'Ephemeral Owner', value: stat.ephemeralOwner === '0' ? 'Persistent' : stat.ephemeralOwner },
    { label: 'CZXID', value: stat.czxid },
    { label: 'MZXID', value: stat.mzxid },
    { label: 'PZXID', value: stat.pzxid },
  ]

  return (
    <div className="p-4">
      <table className="w-full text-sm">
        <tbody>
          {statFields.map(({ label, value }) => (
            <tr key={label} className="border-b border-gray-100">
              <td className="py-2 text-gray-500 w-40">{label}</td>
              <td className="py-2 font-mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ACLTab({ acl }) {
  if (!acl || acl.length === 0) {
    return <div className="p-4 text-gray-500">No ACL information</div>
  }

  return (
    <div className="p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-2 text-left text-gray-500">Scheme</th>
            <th className="py-2 text-left text-gray-500">ID</th>
            <th className="py-2 text-left text-gray-500">Permissions</th>
          </tr>
        </thead>
        <tbody>
          {acl.map((entry, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 font-mono">{entry.scheme}</td>
              <td className="py-2 font-mono">{entry.id}</td>
              <td className="py-2">
                <div className="flex gap-1">
                  {entry.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-2 py-0.5 text-xs bg-gray-100 rounded"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function NodeView({ path, onCreateChild, onEdit, onDelete, onRefresh }) {
  const [node, setNode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('data')
  const [messageTypes, setMessageTypes] = useState([])
  const [pathMappings, setPathMappings] = useState([])

  useEffect(() => {
    if (path) {
      loadNode()
    }
  }, [path])

  useEffect(() => {
    loadProtos()
  }, [])

  const loadNode = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getNode(path)
      setNode(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadProtos = async () => {
    try {
      const data = await getProtos()
      setMessageTypes(data.messageTypes || [])
      setPathMappings(data.pathMappings || [])
    } catch (err) {
      console.error('Failed to load protos:', err)
    }
  }

  const handleRefresh = () => {
    loadNode()
    onRefresh?.()
  }

  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a node to view its data
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">{error}</div>
          <button
            onClick={loadNode}
            className="text-sm text-emerald-600 hover:text-emerald-800"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!node) return null

  const tabs = [
    { id: 'data', label: 'Data' },
    { id: 'decoded', label: 'Decoded' },
    { id: 'stat', label: 'Stat' },
    { id: 'acl', label: 'ACL' },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-mono truncate" title={path}>{path}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCreateChild?.(path)}
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            + Create Child
          </button>
          <button
            onClick={() => onEdit?.(path, node.data)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Edit
          </button>
          {path !== '/' && (
            <button
              onClick={() => onDelete?.(path)}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'data' && (
          <DataTab node={node} onDecode={() => setActiveTab('decoded')} />
        )}
        {activeTab === 'decoded' && (
          <DecodedTab
            node={node}
            messageTypes={messageTypes}
            pathMappings={pathMappings}
          />
        )}
        {activeTab === 'stat' && <StatTab stat={node.stat} />}
        {activeTab === 'acl' && <ACLTab acl={node.acl} />}
      </div>
    </div>
  )
}

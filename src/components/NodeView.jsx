import { useState, useEffect, useRef } from 'react'
import { getNode, getProtos, decodeData } from '../api/zookeeper'

// Searchable select component for message types
function SearchableSelect({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  )

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (opt) => {
    onChange(opt)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-lg cursor-pointer flex items-center justify-between bg-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              autoFocus
            />
          </div>
          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500 text-sm">No matches found</div>
            ) : (
              filteredOptions.slice(0, 100).map((opt) => (
                <div
                  key={opt}
                  className={`px-3 py-2 cursor-pointer text-sm hover:bg-emerald-50 ${
                    opt === value ? 'bg-emerald-100 text-emerald-800' : ''
                  }`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt}
                </div>
              ))
            )}
            {filteredOptions.length > 100 && (
              <div className="px-3 py-2 text-gray-400 text-xs border-t">
                Showing first 100 of {filteredOptions.length} matches. Type more to filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// JSON syntax highlighter component
function JsonHighlight({ data }) {
  const json = JSON.stringify(data, null, 2)

  // Tokenize and colorize JSON
  const colorize = (str) => {
    return str.split('\n').map((line, i) => {
      // Process each line
      const parts = []
      let remaining = line
      let key = 0

      // Match patterns in order (patterns must match at least 1 char)
      const patterns = [
        { regex: /^\s+/, className: '' }, // leading whitespace (1+ chars)
        { regex: /^"([^"\\]|\\.)*"(?=\s*:)/, className: 'text-purple-600' }, // keys
        { regex: /^:\s*/, className: 'text-gray-600' }, // colon
        { regex: /^"([^"\\]|\\.)*"/, className: 'text-green-600' }, // string values
        { regex: /^(true|false)/, className: 'text-orange-600' }, // booleans
        { regex: /^null/, className: 'text-gray-400' }, // null
        { regex: /^-?\d+\.?\d*([eE][+-]?\d+)?/, className: 'text-blue-600' }, // numbers
        { regex: /^[{}\[\],]/, className: 'text-gray-500' }, // brackets and commas
      ]

      while (remaining.length > 0) {
        let matched = false
        for (const { regex, className } of patterns) {
          const match = remaining.match(regex)
          if (match && match[0].length > 0) {
            parts.push(
              <span key={key++} className={className}>
                {match[0]}
              </span>
            )
            remaining = remaining.slice(match[0].length)
            matched = true
            break
          }
        }
        if (!matched) {
          // No pattern matched, take one character
          parts.push(<span key={key++}>{remaining[0]}</span>)
          remaining = remaining.slice(1)
        }
      }

      return (
        <div key={i}>
          {parts}
        </div>
      )
    })
  }

  return <>{colorize(json)}</>
}

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

function DecodedTab({ node, messageTypes, zkRootPath, zkPathTypeMappings, onDecoded }) {
  const [selectedType, setSelectedType] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoDecoded, setAutoDecoded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!decoded) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(decoded, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Get auto-detected type based on ZK path mapping
  const getAutoType = () => {
    if (!zkPathTypeMappings || Object.keys(zkPathTypeMappings).length === 0) return null
    let relativePath = node.path
    if (zkRootPath && node.path.startsWith(zkRootPath)) {
      relativePath = node.path.slice(zkRootPath.length)
    }
    const segments = relativePath.split('/').filter(s => s)
    if (segments.length > 0) {
      return zkPathTypeMappings[segments[0]] || null
    }
    return null
  }

  // Reset and auto-decode when node changes
  useEffect(() => {
    // Reset state
    setDecoded(null)
    setError(null)
    setAutoDecoded(false)
    onDecoded?.(null, null)

    // Auto-select type and decode
    const autoType = getAutoType()
    if (autoType) {
      setSelectedType(autoType)
      if (node.dataHex) {
        setLoading(true)
        decodeData(node.dataHex, autoType, node.path)
          .then(result => {
            setDecoded(result.decoded)
            setAutoDecoded(true)
            onDecoded?.(result.decoded, autoType)
          })
          .catch(err => setError(err.message))
          .finally(() => setLoading(false))
      }
    } else {
      setSelectedType('')
    }
  }, [node.path, node.dataHex, zkRootPath, zkPathTypeMappings])

  const handleDecode = async () => {
    if (!selectedType || !node.dataHex) return

    setLoading(true)
    setError(null)
    try {
      const result = await decodeData(node.dataHex, selectedType, node.path)
      setDecoded(result.decoded)
      onDecoded?.(result.decoded, selectedType)
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
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <SearchableSelect
          value={selectedType}
          onChange={setSelectedType}
          options={messageTypes}
          placeholder="Select message type..."
        />
        <button
          onClick={handleDecode}
          disabled={!selectedType || loading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Decoding...' : 'Decode'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {decoded && (
        <div className="relative flex-1 min-h-0 flex flex-col">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-5 p-1.5 rounded bg-white border border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-800 z-10"
            title="Copy JSON"
          >
            {copied ? (
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm font-mono flex-1 min-h-0">
            <JsonHighlight data={decoded} />
          </pre>
        </div>
      )}

      {loading && !decoded && (
        <div className="flex-1 flex items-center justify-center">
          <svg className="w-8 h-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
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

// Helper to check if a path has an auto-detectable type
function getAutoTypeForPath(path, zkRootPath, zkPathTypeMappings) {
  if (!zkPathTypeMappings || Object.keys(zkPathTypeMappings).length === 0) return null
  let relativePath = path
  if (zkRootPath && path.startsWith(zkRootPath)) {
    relativePath = path.slice(zkRootPath.length)
  }
  const segments = relativePath.split('/').filter(s => s)
  if (segments.length > 0) {
    return zkPathTypeMappings[segments[0]] || null
  }
  return null
}

export default function NodeView({ path, readOnly, onCreateChild, onEdit, onDelete, onRefresh }) {
  const [node, setNode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('data')
  const [messageTypes, setMessageTypes] = useState([])
  const [zkRootPath, setZkRootPath] = useState('')
  const [zkPathTypeMappings, setZkPathTypeMappings] = useState({})
  // Decoded data for edit support
  const [decodedData, setDecodedData] = useState(null)
  const [decodedMessageType, setDecodedMessageType] = useState(null)

  useEffect(() => {
    if (path) {
      loadNode()
    }
  }, [path])

  useEffect(() => {
    loadProtos()
  }, [])

  // Auto-switch to Decoded tab when type is auto-detectable and node has data
  useEffect(() => {
    if (node?.dataHex && getAutoTypeForPath(path, zkRootPath, zkPathTypeMappings)) {
      setActiveTab('decoded')
    }
  }, [node, path, zkRootPath, zkPathTypeMappings])

  // Reset decoded data when path changes
  useEffect(() => {
    setDecodedData(null)
    setDecodedMessageType(null)
  }, [path])

  // Callback for DecodedTab to report decoded data
  const handleDecoded = (data, messageType) => {
    setDecodedData(data)
    setDecodedMessageType(messageType)
  }

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
      setZkRootPath(data.zkRootPath || '')
      setZkPathTypeMappings(data.zkPathTypeMappings || {})
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
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCreateChild?.(path)}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              + Create Child
            </button>
            <button
              onClick={() => onEdit?.(path, node.data, decodedData, decodedMessageType)}
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
        )}
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
            zkRootPath={zkRootPath}
            zkPathTypeMappings={zkPathTypeMappings}
            onDecoded={handleDecoded}
          />
        )}
        {activeTab === 'stat' && <StatTab stat={node.stat} />}
        {activeTab === 'acl' && <ACLTab acl={node.acl} />}
      </div>
    </div>
  )
}

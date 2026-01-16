import { useState, useEffect } from 'react'
import { getChildren } from '../api/zookeeper'

function TreeNode({ node, selectedPath, onSelect, level = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(false)

  const isSelected = selectedPath === node.path

  const handleToggle = async (e) => {
    e.stopPropagation()
    if (!node.hasChildren) return

    if (!expanded && children.length === 0) {
      setLoading(true)
      try {
        const data = await getChildren(node.path)
        setChildren(data)
      } catch (err) {
        console.error('Failed to load children:', err)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  const handleSelect = () => {
    onSelect(node.path)
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 ${
          isSelected ? 'bg-emerald-100 text-emerald-800' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* Expand/collapse icon */}
        <button
          onClick={handleToggle}
          className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
        >
          {node.hasChildren ? (
            loading ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : expanded ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )
          ) : (
            <span className="w-3"></span>
          )}
        </button>

        {/* Folder/file icon */}
        {node.hasChildren ? (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        )}

        {/* Node name */}
        <span className="text-sm font-mono truncate">{node.name}</span>
      </div>

      {/* Children */}
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TreeView({ selectedPath, onSelect }) {
  const [rootChildren, setRootChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadRoot()
  }, [])

  const loadRoot = async () => {
    setLoading(true)
    setError(null)
    try {
      const children = await getChildren('/')
      setRootChildren(children)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <svg className="w-6 h-6 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-500 mb-2">{error}</div>
        <button
          onClick={loadRoot}
          className="text-sm text-emerald-600 hover:text-emerald-800"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="py-2">
      {/* Root node */}
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 ${
          selectedPath === '/' ? 'bg-emerald-100 text-emerald-800' : ''
        }`}
        onClick={() => onSelect('/')}
      >
        <button className="w-4 h-4"></button>
        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <span className="text-sm font-mono">/</span>
      </div>

      {/* Children */}
      {rootChildren.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
          level={1}
        />
      ))}
    </div>
  )
}

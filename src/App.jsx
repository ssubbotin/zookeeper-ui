import { useState, useEffect, useCallback } from 'react'
import { getInfo, createOrUpdateNode, deleteNode } from './api/zookeeper'
import TreeView from './components/TreeView'
import NodeView from './components/NodeView'
import SearchBar from './components/SearchBar'
import ServerInfo from './components/ServerInfo'
import CreateNodeModal from './components/CreateNodeModal'
import EditNodeModal from './components/EditNodeModal'

export default function App() {
  const [selectedPath, setSelectedPath] = useState('/')
  const [serverInfo, setServerInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [error, setError] = useState(null)
  const [treeKey, setTreeKey] = useState(0)

  // Modals
  const [createModal, setCreateModal] = useState(null) // parentPath or null
  const [editModal, setEditModal] = useState(null) // { path, data } or null
  const [deleteConfirm, setDeleteConfirm] = useState(null) // path or null

  const loadServerInfo = useCallback(async () => {
    setInfoLoading(true)
    try {
      const data = await getInfo()
      setServerInfo(data)
    } catch (err) {
      console.error('Failed to load server info:', err)
    } finally {
      setInfoLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServerInfo()
    const interval = setInterval(loadServerInfo, 10000)
    return () => clearInterval(interval)
  }, [loadServerInfo])

  const handleCreateNode = async (path, data) => {
    await createOrUpdateNode(path, data)
    setTreeKey((k) => k + 1) // Refresh tree
    setSelectedPath(path)
  }

  const handleEditNode = async (path, data) => {
    await createOrUpdateNode(path, data)
  }

  const handleDeleteNode = async () => {
    if (!deleteConfirm) return

    try {
      await deleteNode(deleteConfirm)
      setTreeKey((k) => k + 1) // Refresh tree

      // Select parent path
      const parentPath = deleteConfirm.substring(0, deleteConfirm.lastIndexOf('/')) || '/'
      setSelectedPath(parentPath)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleteConfirm(null)
    }
  }

  const refreshTree = () => {
    setTreeKey((k) => k + 1)
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-emerald-600">Zookeeper UI</h1>
            <ServerInfo info={serverInfo} loading={infoLoading} />
          </div>
          <button
            onClick={refreshTree}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-200">
            <SearchBar onSelect={setSelectedPath} />
          </div>
          <div className="flex-1 overflow-auto">
            <TreeView
              key={treeKey}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 bg-white overflow-hidden">
          <NodeView
            path={selectedPath}
            onCreateChild={(parentPath) => setCreateModal(parentPath)}
            onEdit={(path, data) => setEditModal({ path, data })}
            onDelete={(path) => setDeleteConfirm(path)}
            onRefresh={refreshTree}
          />
        </main>
      </div>

      {/* Create Node Modal */}
      {createModal && (
        <CreateNodeModal
          parentPath={createModal}
          onClose={() => setCreateModal(null)}
          onSubmit={handleCreateNode}
        />
      )}

      {/* Edit Node Modal */}
      {editModal && (
        <EditNodeModal
          path={editModal.path}
          initialData={editModal.data}
          onClose={() => setEditModal(null)}
          onSubmit={handleEditNode}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-medium mb-2">Delete Node</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete{' '}
              <code className="bg-gray-100 px-1 rounded">{deleteConfirm}</code>?
            </p>
            <p className="text-sm text-red-600 mb-4">
              This action cannot be undone. The node must have no children.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNode}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { searchNodes } from '../api/zookeeper'

export default function SearchBar({ onFilterChange }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!query.trim()) {
      onFilterChange(null) // Clear filter
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchNodes(query)
        // Build set of visible paths (matching + all ancestors)
        const visiblePaths = new Set()
        for (const path of results) {
          visiblePaths.add(path)
          // Add all ancestor paths
          const parts = path.split('/').filter(p => p)
          let current = ''
          for (const part of parts) {
            current += '/' + part
            visiblePaths.add(current)
          }
        }
        visiblePaths.add('/') // Always show root
        onFilterChange(visiblePaths)
      } catch (err) {
        console.error('Search failed:', err)
        onFilterChange(null)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, onFilterChange])

  const handleClear = () => {
    setQuery('')
    onFilterChange(null)
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter paths..."
            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
          {loading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {!loading && query && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

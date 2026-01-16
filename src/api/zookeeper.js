const API_BASE = '/api'

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export async function getNode(path = '/') {
  return fetchJson(`${API_BASE}/node?path=${encodeURIComponent(path)}`)
}

export async function getChildren(path = '/') {
  return fetchJson(`${API_BASE}/children?path=${encodeURIComponent(path)}`)
}

export async function searchNodes(pattern) {
  return fetchJson(`${API_BASE}/search?pattern=${encodeURIComponent(pattern)}`)
}

export async function getInfo() {
  return fetchJson(`${API_BASE}/info`)
}

export async function getProtos() {
  return fetchJson(`${API_BASE}/protos`)
}

export async function decodeData(dataHex, messageType, path) {
  return fetchJson(`${API_BASE}/decode`, {
    method: 'POST',
    body: JSON.stringify({ dataHex, messageType, path })
  })
}

export async function encodeData(data, messageType) {
  return fetchJson(`${API_BASE}/encode`, {
    method: 'POST',
    body: JSON.stringify({ data, messageType })
  })
}

export async function createOrUpdateNode(path, data, dataHex = null) {
  return fetchJson(`${API_BASE}/node`, {
    method: 'PUT',
    body: JSON.stringify({ path, data, dataHex })
  })
}

export async function deleteNode(path) {
  return fetchJson(`${API_BASE}/node?path=${encodeURIComponent(path)}`, {
    method: 'DELETE'
  })
}

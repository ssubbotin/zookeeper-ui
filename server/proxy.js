import express from 'express'
import cors from 'cors'
import zookeeper from 'node-zookeeper-client'
import protobuf from 'protobufjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json())

// Configuration
const ZK_CONNECTION_STRING = process.env.ZK_CONNECTION_STRING || 'localhost:2181'
const PROTO_DIR = process.env.PROTO_DIR || join(__dirname, '../protos')
const PROTO_IMPORT_PREFIX = process.env.PROTO_IMPORT_PREFIX || ''  // e.g., 'myapp/proto/'
const GOOGLE_PROTOS_DIR = process.env.GOOGLE_PROTOS_DIR || '/app/google-protos'
const READ_ONLY = process.env.READ_ONLY === 'true' || process.env.READ_ONLY === '1'

// ZK path to protobuf type mapping
// Format: "segment:MessageType,segment:MessageType,..."
// e.g., "backends:myapp.Backend,configs:myapp.Config"
const ZK_PATH_TYPE_MAP = process.env.ZK_PATH_TYPE_MAP || ''
const ZK_ROOT_PATH = process.env.ZK_ROOT_PATH || ''  // e.g., '/myapp_prod'

// Zookeeper client
let zkClient = null
let zkConnected = false

// Protobuf root
let protoRoot = new protobuf.Root()
let messageTypes = []

// Parse ZK path to type mapping
const zkPathTypeMap = new Map()
if (ZK_PATH_TYPE_MAP) {
  ZK_PATH_TYPE_MAP.split(',').forEach(mapping => {
    const [segment, type] = mapping.split(':').map(s => s.trim())
    if (segment && type) {
      zkPathTypeMap.set(segment, type)
    }
  })
}

// Get message type for a ZK path based on mapping
function getMessageTypeForPath(zkPath) {
  if (!zkPath || zkPathTypeMap.size === 0) return null

  // Strip root path if configured
  let relativePath = zkPath
  if (ZK_ROOT_PATH && zkPath.startsWith(ZK_ROOT_PATH)) {
    relativePath = zkPath.slice(ZK_ROOT_PATH.length)
  }

  // Get first segment after root (e.g., /backends/foo/bar -> backends)
  const segments = relativePath.split('/').filter(s => s)
  if (segments.length === 0) return null

  const firstSegment = segments[0]
  return zkPathTypeMap.get(firstSegment) || null
}

// Connect to Zookeeper
function connectZk() {
  zkClient = zookeeper.createClient(ZK_CONNECTION_STRING, {
    sessionTimeout: 30000,
    spinDelay: 1000,
    retries: 3
  })

  zkClient.on('connected', () => {
    console.log('Connected to Zookeeper:', ZK_CONNECTION_STRING)
    zkConnected = true
  })

  zkClient.on('disconnected', () => {
    console.log('Disconnected from Zookeeper')
    zkConnected = false
  })

  zkClient.on('expired', () => {
    console.log('Zookeeper session expired, reconnecting...')
    zkConnected = false
    setTimeout(connectZk, 1000)
  })

  zkClient.connect()
}

// Load proto files
async function loadProtos() {
  try {
    const files = await readdir(PROTO_DIR).catch(() => [])
    const protoFiles = files.filter(f => f.endsWith('.proto'))

    if (protoFiles.length === 0) {
      console.log('No .proto files found in', PROTO_DIR)
      return
    }

    protoRoot = new protobuf.Root()

    // Configure path resolution for imports
    protoRoot.resolvePath = (origin, target) => {
      // If target is already an absolute path, return it as-is
      if (target.startsWith('/')) {
        return target
      }
      if (target.startsWith('google/protobuf/')) {
        // Use protobufjs bundled google protos
        return join(dirname(require.resolve('protobufjs')), target)
      }
      if (target.startsWith('google/api/')) {
        // Google API protos bundled in separate dir (not overwritten by volume mount)
        return join(GOOGLE_PROTOS_DIR, target)
      }
      if (PROTO_IMPORT_PREFIX && target.startsWith(PROTO_IMPORT_PREFIX)) {
        // Map configured import prefix to PROTO_DIR
        return join(PROTO_DIR, target.slice(PROTO_IMPORT_PREFIX.length))
      }
      // For relative imports, resolve relative to origin's directory
      if (origin) {
        return join(dirname(origin), target)
      }
      return join(PROTO_DIR, target)
    }

    // Load all proto files together to resolve cross-file dependencies
    const filePaths = protoFiles.map(f => join(PROTO_DIR, f))
    try {
      await protoRoot.load(filePaths)
      console.log('Loaded proto files:', protoFiles.join(', '))
    } catch (err) {
      console.error('Failed to load proto files:', err.message)
    }

    // Extract all message types
    messageTypes = []
    function extractTypes(ns, prefix = '') {
      for (const [name, value] of Object.entries(ns.nested || {})) {
        const fullName = prefix ? `${prefix}.${name}` : name
        if (value instanceof protobuf.Type) {
          messageTypes.push(fullName)
        }
        if (value.nested) {
          extractTypes(value, fullName)
        }
      }
    }
    extractTypes(protoRoot)
    console.log('Available message types:', messageTypes)
  } catch (err) {
    console.error('Failed to load protos:', err)
  }
}

// Helper: promisify ZK operations
function zkGetData(path) {
  return new Promise((resolve, reject) => {
    zkClient.getData(path, (err, data, stat) => {
      if (err) reject(err)
      else resolve({ data, stat })
    })
  })
}

function zkGetChildren(path) {
  return new Promise((resolve, reject) => {
    zkClient.getChildren(path, (err, children) => {
      if (err) reject(err)
      else resolve(children)
    })
  })
}

function zkExists(path) {
  return new Promise((resolve, reject) => {
    zkClient.exists(path, (err, stat) => {
      if (err) reject(err)
      else resolve(stat)
    })
  })
}

function zkCreate(path, data) {
  return new Promise((resolve, reject) => {
    zkClient.create(path, data, (err, resultPath) => {
      if (err) reject(err)
      else resolve(resultPath)
    })
  })
}

function zkSetData(path, data, version = -1) {
  return new Promise((resolve, reject) => {
    zkClient.setData(path, data, version, (err, stat) => {
      if (err) reject(err)
      else resolve(stat)
    })
  })
}

function zkRemove(path, version = -1) {
  return new Promise((resolve, reject) => {
    zkClient.remove(path, version, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function zkGetACL(path) {
  return new Promise((resolve, reject) => {
    zkClient.getACL(path, (err, acls, stat) => {
      if (err) reject(err)
      else resolve({ acls, stat })
    })
  })
}

// Format stat for JSON response
function formatStat(stat) {
  // Helper to safely format date
  const formatDate = (val) => {
    try {
      let num
      if (Buffer.isBuffer(val)) {
        num = Number(val.readBigInt64BE?.() ?? 0)
      } else if (typeof val === 'object') {
        num = Number(val)
      } else {
        num = val
      }
      if (!num || num <= 0) return null
      return new Date(num).toISOString()
    } catch {
      return null
    }
  }

  // Helper to safely convert to string (handles Buffer/Long objects)
  const toString = (val) => {
    try {
      if (!val) return '0'
      if (Buffer.isBuffer(val)) {
        const bigint = val.readBigInt64BE?.()
        return bigint !== undefined ? bigint.toString() : val.toString('hex')
      }
      if (typeof val === 'object' && val.toString) return val.toString()
      return String(val)
    } catch {
      return '0'
    }
  }

  return {
    czxid: toString(stat.czxid),
    mzxid: toString(stat.mzxid),
    ctime: formatDate(stat.ctime),
    mtime: formatDate(stat.mtime),
    version: stat.version,
    cversion: stat.cversion,
    aversion: stat.aversion,
    ephemeralOwner: toString(stat.ephemeralOwner),
    dataLength: stat.dataLength,
    numChildren: stat.numChildren,
    pzxid: toString(stat.pzxid)
  }
}

// Format ACL for JSON response
function formatACL(acl) {
  const perms = []
  if (acl.permission & zookeeper.Permission.READ) perms.push('READ')
  if (acl.permission & zookeeper.Permission.WRITE) perms.push('WRITE')
  if (acl.permission & zookeeper.Permission.CREATE) perms.push('CREATE')
  if (acl.permission & zookeeper.Permission.DELETE) perms.push('DELETE')
  if (acl.permission & zookeeper.Permission.ADMIN) perms.push('ADMIN')

  return {
    scheme: acl.id.scheme,
    id: acl.id.id,
    permissions: perms
  }
}

// API: Get node data, stat, and children
app.get('/api/node', async (req, res) => {
  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const path = req.query.path || '/'
    const { data, stat } = await zkGetData(path)
    const children = await zkGetChildren(path)
    const { acls } = await zkGetACL(path)

    // Try to decode data as string
    let dataString = null
    let dataHex = null
    let isJson = false
    let jsonData = null

    if (data) {
      dataHex = data.toString('hex')
      try {
        dataString = data.toString('utf8')
        // Check if it's valid JSON
        jsonData = JSON.parse(dataString)
        isJson = true
      } catch {
        // Not JSON, might be binary
      }
    }

    res.json({
      path,
      data: dataString,
      dataHex,
      isJson,
      jsonData,
      stat: formatStat(stat),
      children: children.sort(),
      acl: acls.map(formatACL)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Get children only (for lazy loading)
app.get('/api/children', async (req, res) => {
  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const path = req.query.path || '/'
    const children = await zkGetChildren(path)

    // Get stat for each child to know if it has children
    const childrenWithInfo = await Promise.all(
      children.map(async (child) => {
        const childPath = path === '/' ? `/${child}` : `${path}/${child}`
        try {
          const stat = await zkExists(childPath)
          return {
            name: child,
            path: childPath,
            hasChildren: stat ? stat.numChildren > 0 : false
          }
        } catch {
          return { name: child, path: childPath, hasChildren: false }
        }
      })
    )

    res.json(childrenWithInfo.sort((a, b) => a.name.localeCompare(b.name)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Search nodes by path pattern
app.get('/api/search', async (req, res) => {
  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const pattern = req.query.pattern || ''
    if (!pattern) {
      return res.json([])
    }

    const results = []
    const maxResults = 100

    // Recursive search
    async function searchPath(path) {
      if (results.length >= maxResults) return

      if (path.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(path)
      }

      try {
        const children = await zkGetChildren(path)
        for (const child of children) {
          if (results.length >= maxResults) break
          const childPath = path === '/' ? `/${child}` : `${path}/${child}`
          await searchPath(childPath)
        }
      } catch {
        // Ignore errors for inaccessible nodes
      }
    }

    await searchPath('/')
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Get server info
app.get('/api/info', async (req, res) => {
  res.json({
    connected: zkConnected,
    connectionString: ZK_CONNECTION_STRING,
    protoDir: PROTO_DIR,
    protoImportPrefix: PROTO_IMPORT_PREFIX,
    zkRootPath: ZK_ROOT_PATH,
    zkPathTypeMappings: Object.fromEntries(zkPathTypeMap),
    messageTypesCount: messageTypes.length,
    readOnly: READ_ONLY
  })
})

// API: List proto files and message types
app.get('/api/protos', async (req, res) => {
  try {
    const files = await readdir(PROTO_DIR).catch(() => [])
    const protoFiles = files.filter(f => f.endsWith('.proto'))

    res.json({
      files: protoFiles,
      messageTypes,
      zkRootPath: ZK_ROOT_PATH,
      zkPathTypeMappings: Object.fromEntries(zkPathTypeMap)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Decode binary data with protobuf
app.post('/api/decode', async (req, res) => {
  try {
    const { dataHex, messageType, path } = req.body

    if (!dataHex) {
      return res.status(400).json({ error: 'No data provided' })
    }

    // Determine message type (explicit or from ZK path mapping)
    let typeName = messageType
    if (!typeName && path) {
      typeName = getMessageTypeForPath(path)
    }

    if (!typeName) {
      return res.status(400).json({ error: 'No message type specified' })
    }

    const MessageType = protoRoot.lookupType(typeName)
    if (!MessageType) {
      return res.status(400).json({ error: `Message type not found: ${typeName}` })
    }

    const buffer = Buffer.from(dataHex, 'hex')
    const decoded = MessageType.decode(buffer)
    const object = MessageType.toObject(decoded, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true
    })

    res.json({ decoded: object, messageType: typeName })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Helper: recursively convert string numbers to actual numbers for protobuf encoding
function convertStringNumbers(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) {
    return obj.map(convertStringNumbers)
  }
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertStringNumbers(value)
    }
    return result
  }
  if (typeof obj === 'string') {
    // Check if it's a numeric string (integer or float)
    if (/^-?\d+$/.test(obj)) {
      // Integer - use BigInt for large numbers, regular number for small ones
      const num = Number(obj)
      if (Number.isSafeInteger(num)) {
        return num
      }
      // For large integers, keep as string - protobufjs Long handles it
      return obj
    }
    if (/^-?\d+\.\d+$/.test(obj)) {
      return parseFloat(obj)
    }
  }
  return obj
}

// API: Encode JSON data to protobuf binary
app.post('/api/encode', async (req, res) => {
  try {
    const { data, messageType } = req.body

    if (!data) {
      return res.status(400).json({ error: 'No data provided' })
    }

    if (!messageType) {
      return res.status(400).json({ error: 'No message type specified' })
    }

    const MessageType = protoRoot.lookupType(messageType)
    if (!MessageType) {
      return res.status(400).json({ error: `Message type not found: ${messageType}` })
    }

    // Convert string numbers back to numbers (they were stringified during decode for precision)
    const convertedData = convertStringNumbers(data)

    // Create and encode the message (fromObject handles type conversions)
    const message = MessageType.fromObject(convertedData)
    const buffer = MessageType.encode(message).finish()
    const dataHex = Buffer.from(buffer).toString('hex')

    res.json({ dataHex, size: buffer.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Create or update node
app.put('/api/node', async (req, res) => {
  if (READ_ONLY) {
    return res.status(403).json({ error: 'Server is in read-only mode' })
  }

  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const { path, data, dataHex } = req.body

    if (!path) {
      return res.status(400).json({ error: 'Path is required' })
    }

    // Support both string data and hex-encoded binary data
    let buffer
    if (dataHex) {
      buffer = Buffer.from(dataHex, 'hex')
    } else if (data) {
      buffer = Buffer.from(data, 'utf8')
    } else {
      buffer = Buffer.alloc(0)
    }

    const exists = await zkExists(path)

    if (exists) {
      await zkSetData(path, buffer)
      res.json({ success: true, action: 'updated' })
    } else {
      await zkCreate(path, buffer)
      res.json({ success: true, action: 'created' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Delete node
app.delete('/api/node', async (req, res) => {
  if (READ_ONLY) {
    return res.status(403).json({ error: 'Server is in read-only mode' })
  }

  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const path = req.query.path

    if (!path || path === '/') {
      return res.status(400).json({ error: 'Invalid path' })
    }

    await zkRemove(path)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'))
  })
}

// Start server
const PORT = process.env.PORT || 3000

async function start() {
  console.log('Configuration:')
  console.log('  ZK_CONNECTION_STRING:', ZK_CONNECTION_STRING)
  console.log('  PROTO_DIR:', PROTO_DIR)
  console.log('  PROTO_IMPORT_PREFIX:', PROTO_IMPORT_PREFIX || '(not set)')
  console.log('  ZK_ROOT_PATH:', ZK_ROOT_PATH || '(not set)')
  console.log('  ZK_PATH_TYPE_MAP:', zkPathTypeMap.size > 0 ? Object.fromEntries(zkPathTypeMap) : '(not set)')
  console.log('  READ_ONLY:', READ_ONLY)

  await loadProtos()
  connectZk()

  app.listen(PORT, () => {
    console.log(`Zookeeper UI server running on http://localhost:${PORT}`)
  })
}

start()

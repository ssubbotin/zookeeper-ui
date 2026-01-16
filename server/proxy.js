import express from 'express'
import cors from 'cors'
import zookeeper from 'node-zookeeper-client'
import protobuf from 'protobufjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdir, readFile } from 'fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json())

// Configuration
const ZK_CONNECTION_STRING = process.env.ZK_CONNECTION_STRING || 'localhost:2181'
const PROTO_DIR = process.env.PROTO_DIR || join(__dirname, '../protos')
const PROTO_PATH_MAPPING = process.env.PROTO_PATH_MAPPING || ''

// Zookeeper client
let zkClient = null
let zkConnected = false

// Protobuf root
let protoRoot = new protobuf.Root()
let messageTypes = []

// Parse path mapping
const pathMappings = PROTO_PATH_MAPPING
  ? PROTO_PATH_MAPPING.split(',').map(m => {
      const [path, type] = m.split(':')
      return { path, type }
    })
  : []

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

    for (const file of protoFiles) {
      const filePath = join(PROTO_DIR, file)
      try {
        await protoRoot.load(filePath)
        console.log('Loaded proto file:', file)
      } catch (err) {
        console.error('Failed to load proto file:', file, err.message)
      }
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
  return {
    czxid: stat.czxid.toString(),
    mzxid: stat.mzxid.toString(),
    ctime: new Date(stat.ctime).toISOString(),
    mtime: new Date(stat.mtime).toISOString(),
    version: stat.version,
    cversion: stat.cversion,
    aversion: stat.aversion,
    ephemeralOwner: stat.ephemeralOwner.toString(),
    dataLength: stat.dataLength,
    numChildren: stat.numChildren,
    pzxid: stat.pzxid.toString()
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
    messageTypesCount: messageTypes.length
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
      pathMappings
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

    // Determine message type (explicit or from path mapping)
    let typeName = messageType
    if (!typeName && path) {
      const mapping = pathMappings.find(m => path.startsWith(m.path))
      if (mapping) {
        typeName = mapping.type
      }
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

// API: Create or update node
app.put('/api/node', async (req, res) => {
  if (!zkConnected) {
    return res.status(503).json({ error: 'Not connected to Zookeeper' })
  }

  try {
    const { path, data } = req.body

    if (!path) {
      return res.status(400).json({ error: 'Path is required' })
    }

    const buffer = data ? Buffer.from(data, 'utf8') : Buffer.alloc(0)
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
  await loadProtos()
  connectZk()

  app.listen(PORT, () => {
    console.log(`Zookeeper UI server running on http://localhost:${PORT}`)
  })
}

start()

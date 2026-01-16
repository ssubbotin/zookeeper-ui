# Zookeeper UI

A modern, lean web UI for Apache Zookeeper with protobuf deserialization support.

## Features

### Node Browser
- Hierarchical tree view of Zookeeper nodes
- Lazy loading for efficient navigation
- Search nodes by path pattern
- Create, edit, and delete nodes

### Data Viewer
- View data as string, hex, or JSON
- Protobuf decoding with selectable message types
- Node statistics (version, timestamps, data length)
- ACL (Access Control List) display

### Protobuf Support
- Mount .proto files for automatic loading
- Select message type for decoding binary data
- Auto-detect message type based on path patterns

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Express.js, node-zookeeper-client, protobufjs

## Quick Start

### Using Docker Hub (recommended)

```bash
docker run -p 3000:3000 \
  -e ZK_CONNECTION_STRING=your-zk-host:2181 \
  -v ./protos:/app/protos \
  ssubbotin/zookeeper-ui
```

Open http://localhost:3000

### Using Docker Compose

```yaml
services:
  zookeeper-ui:
    image: ssubbotin/zookeeper-ui:latest
    ports:
      - "3000:3000"
    environment:
      - ZK_CONNECTION_STRING=zookeeper:2181
    volumes:
      - ./protos:/app/protos
    depends_on:
      - zookeeper

  zookeeper:
    image: zookeeper:3.9
    ports:
      - "2181:2181"
```

```bash
docker-compose up -d
```

### Local Development

```bash
# Install dependencies
npm install

# Start dev server (frontend + proxy)
npm run dev

# Open http://localhost:5173
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZK_CONNECTION_STRING` | `localhost:2181` | Zookeeper connection string |
| `PORT` | `3000` | Server port (production) |
| `PROTO_DIR` | `/app/protos` | Directory for .proto files |
| `PROTO_PATH_MAPPING` | - | Path-to-message type mapping |

### Protobuf Setup

Mount your .proto files to the `protos/` directory:

```bash
docker run -p 3000:3000 \
  -e ZK_CONNECTION_STRING=zookeeper:2181 \
  -v /path/to/your/protos:/app/protos \
  ssubbotin/zookeeper-ui
```

### Path-based Auto-Detection

Set `PROTO_PATH_MAPPING` to automatically select message types based on node paths:

```bash
PROTO_PATH_MAPPING=/config/users:UserConfig,/data/events:EventMessage
```

When viewing `/config/users/user1`, the UI will automatically select `UserConfig` for decoding.

## Project Structure

```
zookeeper-ui/
├── src/                  # React frontend
│   ├── components/       # UI components
│   └── api/              # API client
├── server/
│   └── proxy.js          # Express proxy with ZK client
├── protos/               # Mount your .proto files here
├── Dockerfile
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/node?path=/` | Get node data, stat, children, ACL |
| GET | `/api/children?path=/` | Get children with metadata |
| GET | `/api/search?pattern=` | Search nodes by path |
| GET | `/api/info` | Server connection status |
| GET | `/api/protos` | List available message types |
| POST | `/api/decode` | Decode binary data with protobuf |
| PUT | `/api/node` | Create or update node |
| DELETE | `/api/node?path=/path` | Delete node |

## License

MIT

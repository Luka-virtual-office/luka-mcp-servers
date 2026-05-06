# LUKA MCP Servers

Model Context Protocol (MCP) servers for the LUKA Virtual Office AI agents. Three specialized servers providing 14 tools across strategic planning, pipeline management, and process design. All servers expose an **HTTP/SSE transport** for cloud deployment on Railway.

---

## Architecture

```
LUKA MCP SERVERS/
├── packages/
│   ├── strategic-planning/    → Port 3001 (4 tools)
│   ├── pipeline-management/   → Port 3002 (5 tools)
│   └── process-design/        → Port 3003 (5 tools)
├── package.json               (npm workspaces root)
├── docker-compose.yml
└── README.md
```

Each server exposes:
- `GET /health` — health check (used by Railway)
- `GET /sse` — MCP SSE connection endpoint
- `POST /messages` — MCP message endpoint

---

## Servers & Tools

### Strategic Planning (`@luka-mcp/strategic-planning`) — Port 3001

| Tool | Description |
|------|-------------|
| `analyze_swot` | SWOT analysis with mission alignment scoring (0-100) |
| `scenario_planning` | Best / worst / likely scenario generation with probability distribution |
| `initiative_roi` | ROI, NPV, and strategic value evaluation for initiatives |
| `mission_alignment_check` | Score any decision against mission statement and values |

### Pipeline Management (`@luka-mcp/pipeline-management`) — Port 3002

| Tool | Description |
|------|-------------|
| `qualify_lead` | BANT + MEDDIC lead scoring with deal potential estimation |
| `predict_close_probability` | Signal-weighted close probability with recommended actions |
| `identify_at_risk_deals` | Pipeline risk detection with critical/high/medium severity |
| `next_best_action` | Contextual sales action recommendation with suggested message |
| `forecast_revenue` | Weighted revenue forecasting with best-case and committed views |

### Process Design (`@luka-mcp/process-design`) — Port 3003

| Tool | Description |
|------|-------------|
| `map_process` | Workflow mapping with bottleneck identification and efficiency score |
| `generate_sop` | Auto-generate a full Standard Operating Procedure document |
| `measure_efficiency` | KPI gap analysis with on-track / at-risk / off-track classification |
| `optimize_workflow` | Optimization recommendations with 3-phase implementation roadmap |
| `capacity_planning` | Team capacity analysis vs. upcoming project demand |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` / `3002` / `3003` | Port the server listens on. Railway injects this automatically. |
| `NODE_ENV` | `production` | Set to `production` in Docker/Railway builds. |

---

## Railway Deployment

Each package is deployed as a separate Railway service pointing at its subdirectory.

### Steps per service

1. Create a new Railway project (or add a service to an existing project).
2. Connect your GitHub repo and set the **Root Directory** to the package subfolder:
   - `packages/strategic-planning`
   - `packages/pipeline-management`
   - `packages/process-design`
3. Railway will detect the `Dockerfile` and `railway.toml` automatically.
4. No extra environment variables are required — Railway injects `PORT`.
5. After deploy, note each service's public URL (e.g. `https://luka-strategic-planning.up.railway.app`).

### Health check

Railway pings `GET /health` and expects `200 OK`. This is configured in `railway.toml`.

---

## Quick Start (Local)

### 1. Install dependencies

```bash
cd "/Users/rubenmarina/Documents/LUKA MCP SERVERS"
npm install
```

### 2. Build all servers

```bash
npm run build
```

### 3. Run a single server (development)

```bash
npm run dev:strategic   # strategic-planning on port 3001
npm run dev:pipeline    # pipeline-management on port 3002
npm run dev:process     # process-design on port 3003
```

### 4. Run tests

```bash
npm run test
```

### 5. Run all with Docker Compose

```bash
docker-compose up --build
```

---

## Connecting to Claude Desktop (Local / stdio)

For local use without HTTP, you can still run via `node` directly. Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "luka-strategic-planning": {
      "command": "node",
      "args": ["/Users/rubenmarina/Documents/LUKA MCP SERVERS/packages/strategic-planning/dist/index.js"]
    },
    "luka-pipeline-management": {
      "command": "node",
      "args": ["/Users/rubenmarina/Documents/LUKA MCP SERVERS/packages/pipeline-management/dist/index.js"]
    },
    "luka-process-design": {
      "command": "node",
      "args": ["/Users/rubenmarina/Documents/LUKA MCP SERVERS/packages/process-design/dist/index.js"]
    }
  }
}
```

Note: In HTTP/SSE mode the server starts an Express listener, so Claude Desktop will open a persistent connection to the SSE endpoint instead of piping stdio.

---

## Connecting via SSE (Cloud / Supabase Edge Function)

Once deployed to Railway, connect using the SSE URL:

```typescript
// Example: connecting from a Supabase Edge Function
const STRATEGIC_PLANNING_URL = 'https://luka-strategic-planning.up.railway.app'

// SSE endpoint for MCP handshake
const sseUrl = `${STRATEGIC_PLANNING_URL}/sse`

// Send messages to
const messagesUrl = `${STRATEGIC_PLANNING_URL}/messages`
```

For use with the MCP TypeScript SDK in a Supabase edge function:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const transport = new SSEClientTransport(new URL('https://luka-strategic-planning.up.railway.app/sse'))
const client = new Client({ name: 'luka-virtual-office', version: '1.0.0' })
await client.connect(transport)

const result = await client.callTool('analyze_swot', { ... })
```

---

## Development Notes

- All servers use **HTTP/SSE transport** for Railway-compatible cloud deployment
- Logs go to **stdout** via the logger utility
- Input validation uses **Zod** schemas in every tool handler
- Tool schemas use the `Shape` / `Handler` export pattern
- Tests use **Vitest** — run `npm run test` from any package or root

---

## Related

- LUKA Virtual Office React app: `/Users/rubenmarina/Documents/LUKA VIRTUAL OFFICE/`
- MCP SDK docs: https://modelcontextprotocol.io/docs

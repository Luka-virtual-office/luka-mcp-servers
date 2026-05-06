import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { mapProcessShape, mapProcessHandler } from './tools/map_process.js'
import { generateSOPShape, generateSOPHandler } from './tools/generate_sop.js'
import { measureEfficiencyShape, measureEfficiencyHandler } from './tools/measure_efficiency.js'
import { optimizeWorkflowShape, optimizeWorkflowHandler } from './tools/optimize_workflow.js'
import { capacityPlanningShape, capacityPlanningHandler } from './tools/capacity_planning.js'
import { logger } from './utils/logger.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3003

// Health check — Railway uses this
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'luka-process-design',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

// MCP SSE endpoint
app.get('/sse', async (_req, res) => {
  const transport = new SSEServerTransport('/messages', res)
  const server = createServer()
  await server.connect(transport)
})

// MCP message endpoint
app.post('/messages', async (req, res) => {
  res.status(200).json({ received: true })
})

function createServer() {
  const server = new McpServer({
    name: 'luka-process-design',
    version: '1.0.0',
  })

  server.tool('map_process', 'Workflow mapping with bottleneck detection and efficiency scoring', mapProcessShape, mapProcessHandler)
  server.tool('generate_sop', 'Auto-generate a full Standard Operating Procedure document', generateSOPShape, generateSOPHandler)
  server.tool('measure_efficiency', 'KPI gap analysis with on-track / at-risk / off-track classification', measureEfficiencyShape, measureEfficiencyHandler)
  server.tool('optimize_workflow', 'Optimization recommendations with 3-phase implementation roadmap', optimizeWorkflowShape, optimizeWorkflowHandler)
  server.tool('capacity_planning', 'Team capacity analysis vs. upcoming project demand', capacityPlanningShape, capacityPlanningHandler)

  return server
}

app.listen(PORT, () => {
  logger.info(`LUKA Process Design MCP Server running on port ${PORT}`)
})

import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { analyzeSWOTShape, analyzeSWOTHandler } from './tools/analyze_swot.js'
import { scenarioPlanningShape, scenarioPlanningHandler } from './tools/scenario_planning.js'
import { initiativeROIShape, initiativeROIHandler } from './tools/initiative_roi.js'
import { missionAlignmentCheckShape, missionAlignmentCheckHandler } from './tools/mission_alignment_check.js'
import { logger } from './utils/logger.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001

// Health check — Railway uses this
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'luka-strategic-planning',
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
    name: 'luka-strategic-planning',
    version: '1.0.0',
  })

  server.tool('analyze_swot', 'Perform SWOT analysis with mission alignment scoring', analyzeSWOTShape, analyzeSWOTHandler)
  server.tool('scenario_planning', 'Generate best/worst/likely scenarios with probability distribution', scenarioPlanningShape, scenarioPlanningHandler)
  server.tool('initiative_roi', 'Evaluate ROI, NPV, and strategic value for an initiative', initiativeROIShape, initiativeROIHandler)
  server.tool('mission_alignment_check', 'Score any decision against mission statement and values', missionAlignmentCheckShape, missionAlignmentCheckHandler)

  return server
}

app.listen(PORT, () => {
  logger.info(`LUKA Strategic Planning MCP Server running on port ${PORT}`)
})

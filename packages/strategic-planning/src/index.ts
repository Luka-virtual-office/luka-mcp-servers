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

// Direct tool invocation endpoint (called by Supabase edge function)
app.post('/invoke', async (req, res) => {
  const { tool, input } = req.body
  const handlers: Record<string, Function> = {
    analyze_swot: analyzeSWOTHandler,
    scenario_planning: scenarioPlanningHandler,
    initiative_roi: initiativeROIHandler,
    mission_alignment_check: missionAlignmentCheckHandler,
  }
  const handler = handlers[tool]
  if (!handler) return res.status(404).json({ error: `Tool '${tool}' not found` })
  try {
    const result = await handler(input)
    const text = result.content?.[0]?.text ?? JSON.stringify(result)
    res.json({ result: text })
  } catch (err: any) {
    logger.error(`[invoke] ${tool} failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
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

app.listen(Number(PORT), '0.0.0.0', () => {
  logger.info(`LUKA Strategic Planning MCP Server running on port ${PORT}`)
})

import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { qualifyLeadShape, qualifyLeadHandler } from './tools/qualify_lead.js'
import { predictCloseProbabilityShape, predictCloseProbabilityHandler } from './tools/predict_close_probability.js'
import { identifyAtRiskDealsShape, identifyAtRiskDealsHandler } from './tools/identify_at_risk_deals.js'
import { nextBestActionShape, nextBestActionHandler } from './tools/next_best_action.js'
import { forecastRevenueShape, forecastRevenueHandler } from './tools/forecast_revenue.js'
import { logger } from './utils/logger.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3002

// Health check — Railway uses this
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'luka-pipeline-management',
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
    name: 'luka-pipeline-management',
    version: '1.0.0',
  })

  server.tool('qualify_lead', 'BANT + MEDDIC lead scoring with deal potential estimation', qualifyLeadShape, qualifyLeadHandler)
  server.tool('predict_close_probability', 'Signal-weighted close probability with recommended actions', predictCloseProbabilityShape, predictCloseProbabilityHandler)
  server.tool('identify_at_risk_deals', 'Pipeline risk detection with critical/high/medium severity triage', identifyAtRiskDealsShape, identifyAtRiskDealsHandler)
  server.tool('next_best_action', 'Contextual sales action recommendation with suggested message', nextBestActionShape, nextBestActionHandler)
  server.tool('forecast_revenue', 'Weighted revenue forecasting with best-case and committed views', forecastRevenueShape, forecastRevenueHandler)

  return server
}

app.listen(Number(PORT), '0.0.0.0', () => {
  logger.info(`LUKA Pipeline Management MCP Server running on port ${PORT}`)
})

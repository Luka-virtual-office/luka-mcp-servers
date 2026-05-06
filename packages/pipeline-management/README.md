# @luka-mcp/pipeline-management

LUKA MCP Server for sales pipeline management. Provides AI-powered tools for lead qualification, deal risk assessment, close probability prediction, next-best-action recommendations, and revenue forecasting.

## Tools

- `qualify_lead` — BANT + MEDDIC lead scoring
- `predict_close_probability` — ML-style close probability prediction with signal analysis
- `identify_at_risk_deals` — Pipeline risk detection with immediate action recommendations
- `next_best_action` — Contextual sales action recommendations
- `forecast_revenue` — Weighted revenue forecasting with confidence levels

## Development

```bash
npm install
npm run build
npm run dev
npm run test
```

## Connecting to Claude

```json
{
  "mcpServers": {
    "luka-pipeline-management": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

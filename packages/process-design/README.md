# @luka-mcp/process-design

LUKA MCP Server for process design and operational excellence. Tools for workflow mapping, SOP generation, efficiency measurement, optimization, and capacity planning.

## Tools

- `map_process` — Workflow mapping with bottleneck detection
- `generate_sop` — Automated Standard Operating Procedure generation
- `measure_efficiency` — KPI measurement and efficiency scoring
- `optimize_workflow` — Optimization recommendations with implementation roadmap
- `capacity_planning` — Team capacity analysis and project feasibility

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
    "luka-process-design": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

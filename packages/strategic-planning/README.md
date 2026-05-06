# @luka-mcp/strategic-planning

LUKA MCP Server for strategic planning tools. Provides AI-powered analysis for SWOT, scenario planning, ROI evaluation, and mission alignment checks.

## Tools

- `analyze_swot` — SWOT analysis with mission alignment scoring
- `scenario_planning` — Best/worst/likely scenario generation
- `initiative_roi` — ROI and NPV evaluation for strategic initiatives
- `mission_alignment_check` — Decision alignment scoring against mission and values

## Development

```bash
npm install
npm run build
npm run dev      # runs with ts-node
npm run test     # runs vitest
```

## Running

```bash
node dist/index.js
```

## Connecting to Claude

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "luka-strategic-planning": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

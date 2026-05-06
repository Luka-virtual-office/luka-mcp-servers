export interface McpTool<TInput, TOutput> {
  schema: Record<string, unknown>  // JSON schema for MCP
  handler: (args: TInput) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

export interface LukaToolResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

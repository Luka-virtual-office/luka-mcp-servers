export const logger = {
  info: (msg: string, data?: unknown) => console.error(`[INFO] ${new Date().toISOString()} ${msg}`, data ?? ''),
  warn: (msg: string, data?: unknown) => console.error(`[WARN] ${new Date().toISOString()} ${msg}`, data ?? ''),
  error: (msg: string, data?: unknown) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, data ?? ''),
}

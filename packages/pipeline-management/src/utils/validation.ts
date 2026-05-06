import { ZodSchema } from 'zod'

export function validateInput<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid input: ${result.error.message}`)
  }
  return result.data
}

import type { ZodType } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'ERROR'
  ) {
    super(message)
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new HttpError(400, message, code)
export const unauthorized = (message = 'Not authenticated', code = 'UNAUTHORIZED') => new HttpError(401, message, code)
export const forbidden = (message = 'You do not have access to this action', code = 'FORBIDDEN') =>
  new HttpError(403, message, code)
export const notFound = (message = 'Not found', code = 'NOT_FOUND') => new HttpError(404, message, code)
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, message, code)

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.')
    throw badRequest(path ? `${path}: ${issue?.message}` : (issue?.message ?? 'Invalid request'), 'VALIDATION')
  }
  return result.data
}

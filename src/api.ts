export type User = {
  id: string
  email: string
  role: string
}

type ApiResponse<T> = T & { message?: string }

const configuredBase = import.meta.env.VITE_CAPTIONS_API_URL?.trim()
const productionBase = 'https://captions-licensing-api.renato-3b0.workers.dev'
// Never allow a local .env.local override to leak into production builds.
const API_BASE = (import.meta.env.PROD ? productionBase : configuredBase || '').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  if (!API_BASE) {
    throw new ApiError('A URL da API não foi configurada. Defina VITE_CAPTIONS_API_URL e reinicie o app.', 0)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique sua conexão e tente novamente.', 0)
  }

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      payload = { message: text }
    }
  }

  if (!response.ok) {
    const nestedError = payload.error
    const errorMessage =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof nestedError === 'string' && nestedError) ||
      (typeof nestedError === 'object' && nestedError !== null && 'message' in nestedError &&
        typeof nestedError.message === 'string' && nestedError.message) ||
      `Ocorreu um erro ao processar sua solicitação (${response.status}).`
    throw new ApiError(errorMessage, response.status)
  }

  return payload as ApiResponse<T>
}

export function authBody(email: string, password?: string) {
  return { email, ...(password ? { password } : {}), client: 'browser' }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

interface ErrorResponse {
  message?: string
}

export async function apiRequest<Response>(path: string, body: unknown): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await readErrorBody(response)
    throw new Error(errorBody.message || `请求失败：${response.status}`)
  }

  if (response.status === 204) {
    return undefined as Response
  }

  return response.json() as Promise<Response>
}

async function readErrorBody(response: Response): Promise<ErrorResponse> {
  try {
    return (await response.json()) as ErrorResponse
  } catch {
    return {}
  }
}

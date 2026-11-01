import { apiNameOf } from '@/system/api/apiNameOf'
import { apiRequest } from '@/system/api/apiRequest'
import { withUserToken } from '@/system/api/withUserToken'
import type { APIMessage } from '@/system/api/APIMessage'

export async function sendAPI<Response>(message: APIMessage<Response>) {
  const body = message.needsUserToken ? withUserToken(message) : message
  return apiRequest<Response>(`/api/${apiNameOf(message)}`, body)
}

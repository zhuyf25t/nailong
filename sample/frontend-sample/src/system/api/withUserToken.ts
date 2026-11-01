import { getAuthToken } from '@/system/api/authToken'
import type { APIMessage } from '@/system/api/APIMessage'

export function withUserToken(message: APIMessage<unknown>) {
  return {
    ...message,
    userToken: getAuthToken() ?? '',
  }
}

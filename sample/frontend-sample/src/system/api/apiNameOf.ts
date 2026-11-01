import type { APIMessage } from '@/system/api/APIMessage'

export function apiNameOf(message: APIMessage<unknown>) {
  return message.constructor.name.toLowerCase()
}

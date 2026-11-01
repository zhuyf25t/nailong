import { APIMessage } from '@/system/api/APIMessage'

export abstract class APIWithTokenMessage<Response> extends APIMessage<Response> {
  override get needsUserToken() {
    return true
  }
}

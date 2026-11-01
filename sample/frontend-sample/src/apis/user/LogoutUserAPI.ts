import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { LogoutResponse } from '@/objects/user/apiTypes/LogoutResponse'

export class LogoutUserAPI extends APIWithTokenMessage<LogoutResponse> {}

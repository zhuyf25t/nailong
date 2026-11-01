import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { UserProfile } from '@/objects/user/UserProfile'

export class GetCurrentUserAPI extends APIWithTokenMessage<UserProfile> {}

import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { UserProfile } from '@/objects/user/UserProfile'

export class RequireAdminUserAPI extends APIWithTokenMessage<UserProfile> {}

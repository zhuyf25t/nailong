package services.user.objects

import java.time.Instant

final case class StoredUser(
  id: UserId,
  username: String,
  passwordHash: String,
  passwordSalt: String,
  role: UserRole,
  createdAt: Instant
)

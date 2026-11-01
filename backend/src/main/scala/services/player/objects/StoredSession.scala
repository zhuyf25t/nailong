package services.player.objects

import java.time.Instant

/** 只包含令牌摘要；不提供 JSON 编码器。 */
final case class StoredSession(
  id: SessionId,
  playerId: PlayerId,
  tokenHash: String,
  createdAt: Instant,
  expiresAt: Instant,
  revokedAt: Option[Instant]
)

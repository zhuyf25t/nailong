package services.player.objects

import java.time.Instant

/** 持久化专用，刻意不提供 JSON 编码器，避免密码摘要越过公开 API 边界。 */
final case class StoredPlayer(
  id: PlayerId,
  username: String,
  nickname: String,
  passwordHash: String,
  passwordSalt: String,
  passwordIterations: Int,
  createdAt: Instant
)

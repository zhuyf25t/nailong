package services.player.utils

import cats.effect.IO
import services.player.objects.{PlayerProfile, SessionId, StoredPlayer, StoredSession}
import services.player.objects.apiTypes.AuthResponse
import services.player.tables.playersession.PlayerSessionTable
import java.sql.Connection
import java.time.temporal.ChronoUnit
import java.util.UUID

object PlayerSession:
  private[player] def profile(stored: StoredPlayer): PlayerProfile =
    PlayerProfile(stored.id, stored.username, stored.nickname, stored.createdAt)

  private[player] def create(connection: Connection, stored: StoredPlayer): IO[AuthResponse] =
    for
      token <- PlayerSecrets.newToken()
      tokenHash <- PlayerSecrets.hashToken(token)
      sessionId <- IO.delay(SessionId(UUID.randomUUID()))
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      expiresAt = now.plus(7, ChronoUnit.DAYS)
      _ <- PlayerSessionTable.insert(connection, StoredSession(sessionId, stored.id, tokenHash, now, expiresAt, None))
    yield AuthResponse(profile(stored), token, expiresAt)

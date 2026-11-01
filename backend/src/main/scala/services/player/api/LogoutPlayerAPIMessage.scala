package services.player.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.{PlayerId, SessionId}
import services.player.objects.apiTypes.LogoutResponse
import services.player.tables.playersession.PlayerSessionTable
import services.system.api.APIWithTokenMessage
import java.sql.Connection
import java.time.temporal.ChronoUnit

final case class LogoutPlayerAPIMessage(playerId: PlayerId, sessionId: SessionId) extends APIWithTokenMessage[LogoutResponse]:
  override def plan(connection: Connection): IO[LogoutResponse] =
    for
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      _ <- PlayerSessionTable.revoke(connection, sessionId, playerId, now)
    yield LogoutResponse(loggedOut = true)

object LogoutPlayerAPIMessage:
  given Decoder[LogoutPlayerAPIMessage] = deriveDecoder[LogoutPlayerAPIMessage]

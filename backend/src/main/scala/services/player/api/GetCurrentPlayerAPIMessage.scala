package services.player.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.{PlayerId, PlayerProfile}
import services.player.tables.player.PlayerTable
import services.player.utils.PlayerSession
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import java.sql.Connection

final case class GetCurrentPlayerAPIMessage(playerId: PlayerId) extends APIWithTokenMessage[PlayerProfile]:
  override def plan(connection: Connection): IO[PlayerProfile] =
    PlayerTable.findById(connection, playerId).flatMap {
      case Some(player) => IO.pure(PlayerSession.profile(player))
      case None => IO.raiseError(HttpError.unauthorized("账号不存在，请重新登录。"))
    }

object GetCurrentPlayerAPIMessage:
  given Decoder[GetCurrentPlayerAPIMessage] = deriveDecoder[GetCurrentPlayerAPIMessage]

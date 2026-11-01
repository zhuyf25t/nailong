package services.player.api

import cats.effect.IO
import services.player.objects.{AuthenticatedPlayer, SessionToken}
import services.player.tables.playersession.PlayerSessionTable
import services.player.utils.PlayerSecrets
import services.system.api.APIMessage
import services.system.objects.HttpError
import java.sql.Connection

/** 仅供路由认证与内部调用，不注册为 HTTP API。 */
final case class ResolvePlayerTokenAPIMessage(token: String) extends APIMessage[AuthenticatedPlayer]:
  override def plan(connection: Connection): IO[AuthenticatedPlayer] =
    for
      _ <- if token.matches("[A-Za-z0-9_-]{43}") then IO.unit else IO.raiseError(HttpError.unauthorized())
      tokenHash <- PlayerSecrets.hashToken(SessionToken(token))
      now <- IO.realTimeInstant
      session <- PlayerSessionTable.resolve(connection, tokenHash, now)
      player <- session match
        case Some(value) => IO.pure(AuthenticatedPlayer(value.playerId, value.id))
        case None => IO.raiseError(HttpError.unauthorized("登录已过期，请重新登录。"))
    yield player

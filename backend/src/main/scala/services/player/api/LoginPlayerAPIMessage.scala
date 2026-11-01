package services.player.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.apiTypes.AuthResponse
import services.player.tables.player.PlayerTable
import services.player.utils.{PlayerSecrets, PlayerSession, PlayerValidation}
import services.system.api.APIMessage
import services.system.objects.HttpError
import java.sql.Connection

final case class LoginPlayerAPIMessage(username: String, password: String) extends APIMessage[AuthResponse]:
  override def plan(connection: Connection): IO[AuthResponse] =
    val cleanUsername = PlayerValidation.normalizeUsername(username)
    for
      _ <- PlayerValidation.validateUsername(cleanUsername)
      _ <- PlayerValidation.validatePassword(password)
      stored <- PlayerTable.findByUsername(connection, cleanUsername)
      valid <- PlayerSecrets.verifyPassword(password, stored)
      player <- (stored, valid) match
        case (Some(player), true) => IO.pure(player)
        case _ => IO.raiseError(HttpError.unauthorized("用户名或密码不正确。"))
      response <- PlayerSession.create(connection, player)
    yield response

object LoginPlayerAPIMessage:
  given Decoder[LoginPlayerAPIMessage] = deriveDecoder[LoginPlayerAPIMessage]

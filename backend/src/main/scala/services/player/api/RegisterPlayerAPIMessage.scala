package services.player.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.{PlayerId, StoredPlayer}
import services.player.objects.apiTypes.AuthResponse
import services.player.tables.player.PlayerTable
import services.player.utils.{PlayerSecrets, PlayerSession, PlayerValidation}
import services.system.api.APIMessage
import services.system.objects.HttpError
import java.sql.{Connection, SQLException}
import java.time.temporal.ChronoUnit
import java.util.UUID

final case class RegisterPlayerAPIMessage(username: String, password: String, nickname: String) extends APIMessage[AuthResponse]:
  override def plan(connection: Connection): IO[AuthResponse] =
    val cleanUsername = PlayerValidation.normalizeUsername(username)
    val cleanNickname = nickname.trim
    for
      _ <- PlayerValidation.validateUsername(cleanUsername)
      _ <- PlayerValidation.validatePassword(password)
      _ <- PlayerValidation.validateNickname(cleanNickname)
      existing <- PlayerTable.findByUsername(connection, cleanUsername)
      _ <- if existing.isDefined then IO.raiseError(HttpError.conflict("这个用户名已经注册，请更换用户名或登录。")) else IO.unit
      salt <- PlayerSecrets.newSalt()
      passwordHash <- PlayerSecrets.hashPassword(password, salt, PlayerSecrets.passwordIterations)
      playerId <- IO.delay(PlayerId(UUID.randomUUID()))
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      stored <- PlayerTable.insert(connection, StoredPlayer(playerId, cleanUsername, cleanNickname, passwordHash, salt, PlayerSecrets.passwordIterations, now))
        .handleErrorWith {
          case error: SQLException if error.getSQLState == "23505" =>
            IO.raiseError(HttpError.conflict("这个用户名已经注册，请更换用户名或登录。"))
          case error => IO.raiseError(error)
        }
      response <- PlayerSession.create(connection, stored)
    yield response

object RegisterPlayerAPIMessage:
  given Decoder[RegisterPlayerAPIMessage] = deriveDecoder[RegisterPlayerAPIMessage]

package services.user.utils

import cats.effect.IO
import services.user.objects.UserId
import services.user.tables.usersession.UserSessionTable
import system.HttpError

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.sql.Connection

private[user] final case class ResolveUserToken(userToken: String):

  def plan(connection: Connection): IO[UserId] =
    for
      token <- cleanToken(userToken)
      hash = tokenHash(token)
      _ <- UserSessionTable.deleteExpired(connection)
      user <- UserSessionTable.findUserByTokenHash(connection, hash).flatMap {
        case Some(user) => IO.pure(user)
        case None => IO.raiseError(HttpError.Unauthorized("登录状态已失效，请重新登录。"))
      }
    yield user.id

  private def cleanToken(value: String): IO[String] =
    Option(value).map(_.trim).filter(_.nonEmpty) match
      case Some(token) => IO.pure(token)
      case None => IO.raiseError(HttpError.Unauthorized("请先登录。"))

  private def tokenHash(token: String): String =
    val digest = MessageDigest.getInstance("SHA-256")
    val bytes = digest.digest(token.getBytes(StandardCharsets.UTF_8))
    bytes.map(byte => f"${byte & 0xff}%02x").mkString

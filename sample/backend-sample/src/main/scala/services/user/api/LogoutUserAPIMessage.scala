package services.user.api

import cats.effect.IO
import services.user.objects.UserId
import services.user.objects.apiTypes.LogoutResponse
import services.user.tables.usersession.UserSessionTable
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class LogoutUserAPIMessage(userId: UserId) extends APIWithTokenMessage[LogoutResponse]:

  override def plan(connection: Connection): IO[LogoutResponse] =
    for
      _ <- UserSessionTable.deleteByUserId(connection, userId)
    yield LogoutResponse(ok = true)

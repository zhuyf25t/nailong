package services.user.api

import cats.effect.IO
import services.user.objects.{UserId, UserProfile, UserRole}
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class RequireAdminUserAPIMessage(userId: UserId) extends APIWithTokenMessage[UserProfile]:

  override def plan(connection: Connection): IO[UserProfile] =
    GetCurrentUserAPIMessage(userId).plan(connection).flatMap { user =>
      if user.role == UserRole.Admin then IO.pure(user)
      else IO.raiseError(HttpError.Forbidden("当前账号没有管理员权限。"))
    }

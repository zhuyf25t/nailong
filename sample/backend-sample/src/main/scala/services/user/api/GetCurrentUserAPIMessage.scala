package services.user.api

import cats.effect.IO
import services.user.objects.{StoredUser, UserId, UserProfile}
import services.user.tables.users.UserTable
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class GetCurrentUserAPIMessage(userId: UserId) extends APIWithTokenMessage[UserProfile]:

  override def plan(connection: Connection): IO[UserProfile] =
    UserTable.findById(connection, userId).flatMap {
      case Some(stored) => IO.pure(profileFromStored(stored))
      case None => IO.raiseError(HttpError.Unauthorized("登录状态已失效，请重新登录。"))
    }

  private def profileFromStored(user: StoredUser): UserProfile =
    UserProfile(
      id = user.id,
      username = user.username,
      role = user.role,
      createdAt = user.createdAt
    )

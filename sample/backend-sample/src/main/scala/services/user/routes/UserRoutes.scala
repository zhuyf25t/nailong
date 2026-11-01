package services.user.routes

import cats.effect.IO
import io.circe.Json
import io.circe.generic.auto.*
import io.circe.syntax.*
import services.user.api.*
import services.user.objects.UserProfile
import services.user.objects.apiTypes.{AuthResponse, LogoutResponse}
import services.user.utils.ResolveUserToken
import system.api.RegisteredAPIMessage.{api, apiWithToken}
import system.api.RegisteredAPIMessage

import java.sql.Connection

object UserRoutes:

  val apiMessages: List[RegisteredAPIMessage] = List(
    api[RegisterUserAPIMessage, AuthResponse],
    api[LoginUserAPIMessage, AuthResponse],
    apiWithToken[GetCurrentUserAPIMessage, UserProfile],
    apiWithToken[RequireAdminUserAPIMessage, UserProfile],
    apiWithToken[LogoutUserAPIMessage, LogoutResponse]
  )

  def resolveUserToken(userToken: String, connection: Connection): IO[Json] =
    ResolveUserToken(userToken).plan(connection).map(_.asJson)

package services.player.routes

import services.player.api.{GetCurrentPlayerAPIMessage, LoginPlayerAPIMessage, LogoutPlayerAPIMessage, RegisterPlayerAPIMessage}
import services.player.objects.PlayerProfile
import services.player.objects.apiTypes.{AuthResponse, LogoutResponse}
import services.system.api.RegisteredAPIMessage
import services.system.api.RegisteredAPIMessage.{api, apiWithToken}

object PlayerRoutes:
  val apiMessages: List[RegisteredAPIMessage] = List(
    api[RegisterPlayerAPIMessage, AuthResponse],
    api[LoginPlayerAPIMessage, AuthResponse],
    apiWithToken[GetCurrentPlayerAPIMessage, PlayerProfile],
    apiWithToken[LogoutPlayerAPIMessage, LogoutResponse]
  )

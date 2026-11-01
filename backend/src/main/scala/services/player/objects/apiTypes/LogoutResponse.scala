package services.player.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class LogoutResponse(loggedOut: Boolean)

object LogoutResponse:
  given Encoder[LogoutResponse] = deriveEncoder[LogoutResponse]
  given Decoder[LogoutResponse] = deriveDecoder[LogoutResponse]

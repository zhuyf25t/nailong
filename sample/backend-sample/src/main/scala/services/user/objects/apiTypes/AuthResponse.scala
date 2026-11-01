package services.user.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.user.objects.UserProfile

final case class AuthResponse(
  ok: Boolean,
  token: Option[String],
  user: Option[UserProfile],
  message: Option[String]
)

object AuthResponse:
  given Encoder[AuthResponse] = deriveEncoder[AuthResponse]
  given Decoder[AuthResponse] = deriveDecoder[AuthResponse]

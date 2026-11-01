package services.user.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class LogoutResponse(ok: Boolean)

object LogoutResponse:
  given Encoder[LogoutResponse] = deriveEncoder[LogoutResponse]
  given Decoder[LogoutResponse] = deriveDecoder[LogoutResponse]

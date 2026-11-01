package system.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class HealthResponse(status: String, service: String)

object HealthResponse:
  given Encoder[HealthResponse] = deriveEncoder[HealthResponse]
  given Decoder[HealthResponse] = deriveDecoder[HealthResponse]

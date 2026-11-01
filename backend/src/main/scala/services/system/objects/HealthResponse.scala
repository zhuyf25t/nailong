package services.system.objects

import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder

final case class HealthResponse(status: String, service: String)
object HealthResponse:
  given Encoder[HealthResponse] = deriveEncoder

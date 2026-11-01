package services.records.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.objects.TrainingResult

final case class ResultLookupResponse(result: Option[TrainingResult])

object ResultLookupResponse:
  given Encoder[ResultLookupResponse] = deriveEncoder[ResultLookupResponse]
  given Decoder[ResultLookupResponse] = deriveDecoder[ResultLookupResponse]

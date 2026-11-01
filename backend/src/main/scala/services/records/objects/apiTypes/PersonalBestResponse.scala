package services.records.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.objects.TrainingResult

final case class PersonalBestResponse(best: Option[TrainingResult])

object PersonalBestResponse:
  given Encoder[PersonalBestResponse] = deriveEncoder[PersonalBestResponse]
  given Decoder[PersonalBestResponse] = deriveDecoder[PersonalBestResponse]

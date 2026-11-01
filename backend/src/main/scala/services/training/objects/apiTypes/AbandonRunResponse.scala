package services.training.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.training.objects.TrainingRun

final case class AbandonRunResponse(run: TrainingRun)

object AbandonRunResponse:
  given Encoder[AbandonRunResponse] = deriveEncoder[AbandonRunResponse]
  given Decoder[AbandonRunResponse] = deriveDecoder[AbandonRunResponse]

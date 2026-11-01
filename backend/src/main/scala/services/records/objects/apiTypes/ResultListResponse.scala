package services.records.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.objects.TrainingResult

final case class ResultListResponse(items: List[TrainingResult], total: Long, offset: Int, limit: Int)

object ResultListResponse:
  given Encoder[ResultListResponse] = deriveEncoder[ResultListResponse]
  given Decoder[ResultListResponse] = deriveDecoder[ResultListResponse]

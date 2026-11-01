package services.records.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class ResultSubmission(
  outcome: ResultOutcome,
  shotsFired: Int,
  hits: Int,
  destroyed: Int,
  elapsedMs: Long,
  objectiveProgress: Option[ObjectiveProgress] = None
)

object ResultSubmission:
  private given Decoder[Int] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toInt)
      .toRight(DecodingFailure("计数必须为 JSON 整数", cursor.history))
  }
  private given Decoder[Long] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toLong)
      .toRight(DecodingFailure("用时必须为 JSON 整数", cursor.history))
  }
  given Encoder[ResultSubmission] = deriveEncoder[ResultSubmission]
  given Decoder[ResultSubmission] = deriveDecoder[ResultSubmission]

package services.training.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class TrainingConfigId(value: UUID)

object TrainingConfigId:
  given Encoder[TrainingConfigId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[TrainingConfigId] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "TrainingConfigId 必须是 UUID")
      .flatMap(uuid => Either.cond(uuid.toString == value, TrainingConfigId(uuid), "TrainingConfigId 必须是规范小写 UUID"))
  }

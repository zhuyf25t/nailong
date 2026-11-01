package services.training.objects

import io.circe.{Decoder, Encoder}

enum TrainingRunStatus:
  case Open, Completed, Abandoned

object TrainingRunStatus:
  def toString(value: TrainingRunStatus): String = value match
    case TrainingRunStatus.Open => "open"
    case TrainingRunStatus.Completed => "completed"
    case TrainingRunStatus.Abandoned => "abandoned"

  def fromString(value: String): Either[String, TrainingRunStatus] = value match
    case "open" => Right(TrainingRunStatus.Open)
    case "completed" => Right(TrainingRunStatus.Completed)
    case "abandoned" => Right(TrainingRunStatus.Abandoned)
    case _ => Left("未知局次状态")

  given Encoder[TrainingRunStatus] = Encoder.encodeString.contramap(toString)
  given Decoder[TrainingRunStatus] = Decoder.decodeString.emap(fromString)

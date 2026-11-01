package services.records.objects

import io.circe.{Decoder, Encoder}

enum ResultOutcome:
  case Victory, Defeat

object ResultOutcome:
  def toString(outcome: ResultOutcome): String = outcome match
    case ResultOutcome.Victory => "victory"
    case ResultOutcome.Defeat => "defeat"

  def fromString(value: String): Either[String, ResultOutcome] = value match
    case "victory" => Right(ResultOutcome.Victory)
    case "defeat" => Right(ResultOutcome.Defeat)
    case _ => Left("outcome 必须为 victory 或 defeat")

  given Encoder[ResultOutcome] = Encoder.encodeString.contramap(toString)
  given Decoder[ResultOutcome] = Decoder.decodeString.emap(fromString)

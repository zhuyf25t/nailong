package services.training.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class TerrainConfig(hillHeight: Double, hillWidth: Double, hillX: Double, hillZ: Double, ripple: Double)

object TerrainConfig:
  private given Decoder[Double] = Decoder.instance { cursor =>
    cursor.value.asNumber match
      case Some(number) if number.toDouble.isFinite => Right(number.toDouble)
      case _ => Left(DecodingFailure("必须是有限的 JSON 数值", cursor.history))
  }
  given Encoder[TerrainConfig] = deriveEncoder[TerrainConfig]
  given Decoder[TerrainConfig] = deriveDecoder[TerrainConfig]

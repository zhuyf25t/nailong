package services.training.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class DroneSpawn(x: Double, z: Double, yaw: Double)

object DroneSpawn:
  private given Decoder[Double] = Decoder.instance { cursor =>
    cursor.value.asNumber match
      case Some(number) if number.toDouble.isFinite => Right(number.toDouble)
      case _ => Left(DecodingFailure("必须是有限的 JSON 数值", cursor.history))
  }
  given Encoder[DroneSpawn] = deriveEncoder[DroneSpawn]
  given Decoder[DroneSpawn] = deriveDecoder[DroneSpawn]

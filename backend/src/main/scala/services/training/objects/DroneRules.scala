package services.training.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class DroneRules(
  maxHp: Int,
  scanRange: Double,
  scanFovDegrees: Double,
  scanSpeed: Double,
  alertSpeed: Double,
  alertSeconds: Double,
  hitScanSeconds: Double,
  lostSightSeconds: Double,
  patrolSpeed: Double,
  chaseSpeed: Double,
  patrolRadius: Double,
  contactRadius: Double,
  spawnGraceSeconds: Double,
  spawns: List[DroneSpawn]
)

object DroneRules:
  private given Decoder[Int] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toInt)
      .toRight(DecodingFailure("必须是范围内的 JSON 整数", cursor.history))
  }
  private given Decoder[Double] = Decoder.instance { cursor =>
    cursor.value.asNumber match
      case Some(number) if number.toDouble.isFinite => Right(number.toDouble)
      case _ => Left(DecodingFailure("必须是有限的 JSON 数值", cursor.history))
  }
  given Encoder[DroneRules] = deriveEncoder[DroneRules]
  given Decoder[DroneRules] = deriveDecoder[DroneRules]

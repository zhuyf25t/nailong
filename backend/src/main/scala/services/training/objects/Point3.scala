package services.training.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class Point3(x: Double, y: Double, z: Double)

object Point3:
  private given Decoder[Double] = Decoder.instance { cursor =>
    cursor.value.asNumber match
      case Some(number) if number.toDouble.isFinite => Right(number.toDouble)
      case _ => Left(DecodingFailure("必须是有限的 JSON 数值", cursor.history))
  }
  given Encoder[Point3] = deriveEncoder[Point3]
  given Decoder[Point3] = deriveDecoder[Point3]

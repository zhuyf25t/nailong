package services.records.utils
import io.circe.{Decoder, DecodingFailure}
object RecordingCodecs:
  given Decoder[Int] = Decoder.instance(c => c.value.asNumber.flatMap(_.toInt).toRight(DecodingFailure("必须为 JSON 整数", c.history)))
  given Decoder[Long] = Decoder.instance(c => c.value.asNumber.flatMap(_.toLong).toRight(DecodingFailure("必须为 JSON 整数", c.history)))
  given Decoder[Double] = Decoder.instance(c => c.value.asNumber.map(_.toDouble).filter(_.isFinite).toRight(DecodingFailure("必须为有限 JSON 数值", c.history)))

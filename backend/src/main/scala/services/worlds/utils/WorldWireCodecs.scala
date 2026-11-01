package services.worlds.utils

import io.circe.{Decoder, DecodingFailure}

private[worlds] object WorldWireCodecs:
  given Decoder[Double] = Decoder.instance { cursor =>
    cursor.value.asNumber.filter(_.toDouble.isFinite).map(_.toDouble)
      .toRight(DecodingFailure("必须是有限的 JSON 数值", cursor.history))
  }
  given Decoder[Int] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toInt).toRight(DecodingFailure("必须是 JSON 整数", cursor.history))
  }

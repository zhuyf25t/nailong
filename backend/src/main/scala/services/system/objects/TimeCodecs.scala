package services.system.objects

import io.circe.{Decoder, Encoder}
import java.time.Instant
import scala.util.Try

object TimeCodecs:
  given Encoder[Instant] = Encoder.encodeString.contramap(_.toString)
  given Decoder[Instant] = Decoder.decodeString.emap(value =>
    Try(Instant.parse(value)).toEither.left.map(_ => "时间必须为带时区的 ISO 8601 格式")
  )

package services.player.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class PlayerId(value: UUID)

object PlayerId:
  given Encoder[PlayerId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[PlayerId] = Decoder.decodeString.emap { value =>
    if !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") then
      Left("PlayerId 必须为完整 UUID。")
    else Try(UUID.fromString(value)).toEither.left.map(_ => "PlayerId 格式错误。").map(PlayerId(_))
  }

package services.player.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class SessionId(value: UUID)

object SessionId:
  given Encoder[SessionId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[SessionId] = Decoder.decodeString.emap { value =>
    if !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") then
      Left("SessionId 必须为完整 UUID。")
    else Try(UUID.fromString(value)).toEither.left.map(_ => "SessionId 格式错误。").map(SessionId(_))
  }

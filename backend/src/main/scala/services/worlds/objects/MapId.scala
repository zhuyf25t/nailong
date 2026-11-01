package services.worlds.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class MapId(value: UUID)
object MapId:
  given Encoder[MapId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[MapId] = Decoder.decodeString.emap(value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "mapId 必须是 UUID")
      .flatMap(id => Either.cond(id.toString == value, MapId(id), "mapId 必须是规范小写 UUID")))

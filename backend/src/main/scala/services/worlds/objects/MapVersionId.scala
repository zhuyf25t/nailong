package services.worlds.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class MapVersionId(value: UUID)
object MapVersionId:
  given Encoder[MapVersionId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[MapVersionId] = Decoder.decodeString.emap(value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "mapVersionId 必须是 UUID")
      .flatMap(id => Either.cond(id.toString == value, MapVersionId(id), "mapVersionId 必须是规范小写 UUID")))

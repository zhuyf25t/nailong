package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldObject(id: String, kind: WorldObjectKind, x: Double, z: Double, width: Double, depth: Double, height: Double)
object WorldObject:
  given Encoder[WorldObject] = deriveEncoder[WorldObject]
  given Decoder[WorldObject] = deriveDecoder[WorldObject]

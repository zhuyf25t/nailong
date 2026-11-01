package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldSpawn(x: Double, z: Double, yaw: Double)
object WorldSpawn:
  given Encoder[WorldSpawn] = deriveEncoder[WorldSpawn]
  given Decoder[WorldSpawn] = deriveDecoder[WorldSpawn]

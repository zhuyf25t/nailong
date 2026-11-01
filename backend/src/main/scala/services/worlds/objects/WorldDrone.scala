package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldDrone(id: String, x: Double, z: Double, yaw: Double, patrol: List[WorldPoint])
object WorldDrone:
  given Encoder[WorldDrone] = deriveEncoder[WorldDrone]
  given Decoder[WorldDrone] = deriveDecoder[WorldDrone]

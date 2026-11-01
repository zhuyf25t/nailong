package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldMarker(id: String, x: Double, z: Double, radius: Double)
object WorldMarker:
  given Encoder[WorldMarker] = deriveEncoder[WorldMarker]
  given Decoder[WorldMarker] = deriveDecoder[WorldMarker]

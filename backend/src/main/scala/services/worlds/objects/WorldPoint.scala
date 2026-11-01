package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldPoint(x: Double, z: Double)
object WorldPoint:
  given Encoder[WorldPoint] = deriveEncoder[WorldPoint]
  given Decoder[WorldPoint] = deriveDecoder[WorldPoint]

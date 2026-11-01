package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.utils.WorldWireCodecs.given
final case class WorldBounds(halfSize: Double)
object WorldBounds:
  given Encoder[WorldBounds] = deriveEncoder[WorldBounds]
  given Decoder[WorldBounds] = deriveDecoder[WorldBounds]

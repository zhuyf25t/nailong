package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import java.time.Instant
import services.system.objects.TimeCodecs.given
import services.worlds.utils.WorldWireCodecs.given
final case class MapVersion(id: MapVersionId, mapId: MapId, version: Int, title: String, world: WorldDefinition, createdAt: Instant, builtIn: Boolean)
object MapVersion:
  given Encoder[MapVersion] = deriveEncoder[MapVersion]
  given Decoder[MapVersion] = deriveDecoder[MapVersion]

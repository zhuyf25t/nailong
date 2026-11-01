package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import java.time.Instant
import services.system.objects.TimeCodecs.given
import services.worlds.utils.WorldWireCodecs.given
final case class MapDraft(mapId: MapId, title: String, revision: Int, world: WorldDefinition, updatedAt: Instant)
object MapDraft:
  given Encoder[MapDraft] = deriveEncoder[MapDraft]
  given Decoder[MapDraft] = deriveDecoder[MapDraft]

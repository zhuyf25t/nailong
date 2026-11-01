package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import java.time.Instant
import services.system.objects.TimeCodecs.given
import services.worlds.utils.WorldWireCodecs.given
final case class MapSummary(mapId: MapId, title: String, revision: Int, latestVersionId: Option[MapVersionId], updatedAt: Instant, builtIn: Boolean)
object MapSummary:
  given Encoder[MapSummary] = deriveEncoder[MapSummary]
  given Decoder[MapSummary] = deriveDecoder[MapSummary]

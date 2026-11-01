package services.worlds.objects.apiTypes
import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder
import services.worlds.objects.{MapSummary, MapVersion}
final case class MapListResponse(maps: List[MapSummary], total: Int, templates: List[MapVersion])
object MapListResponse:
  given Encoder[MapListResponse] = deriveEncoder[MapListResponse]

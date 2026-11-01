package services.worlds.objects.apiTypes
import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder
import services.worlds.objects.MissionDefinition
final case class MissionListResponse(missions: List[MissionDefinition])
object MissionListResponse:
  given Encoder[MissionListResponse] = deriveEncoder[MissionListResponse]

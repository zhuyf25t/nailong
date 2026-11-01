package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
final case class MissionDefinition(id: MissionId, version: String, title: String, description: String,
  objective: MissionObjective, mapVersionId: MapVersionId, allowedTools: List[ToolKind], configVersion: String)
object MissionDefinition:
  given Encoder[MissionDefinition] = deriveEncoder[MissionDefinition]
  given Decoder[MissionDefinition] = deriveDecoder[MissionDefinition]

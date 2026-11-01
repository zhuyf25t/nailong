package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.system.api.APIMessage
import services.system.objects.HttpError
import services.worlds.objects.{MissionDefinition, MissionId}
import services.worlds.tables.mission.MissionTable
import services.worlds.utils.WorldResources
final case class GetMissionAPIMessage(missionId: MissionId) extends APIMessage[MissionDefinition]:
  def plan(connection: Connection): IO[MissionDefinition] = for
    published <- IO.fromOption(WorldResources.missions.find(_.id == missionId))(HttpError.notFound("任务不存在。"))
    stored <- MissionTable.find(connection, published.id, published.version)
    result <- IO.fromOption(stored)(new IllegalStateException("Published mission is missing"))
  yield result
object GetMissionAPIMessage:
  given Decoder[GetMissionAPIMessage] = deriveDecoder[GetMissionAPIMessage]

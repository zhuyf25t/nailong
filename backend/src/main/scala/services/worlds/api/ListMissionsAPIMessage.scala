package services.worlds.api
import cats.effect.IO
import cats.syntax.all.*
import java.sql.Connection
import services.system.api.NoRequestMessage
import services.worlds.objects.apiTypes.MissionListResponse
import services.worlds.tables.mission.MissionTable
import services.worlds.utils.WorldResources
final case class ListMissionsAPIMessage() extends NoRequestMessage[MissionListResponse]:
  def plan(connection: Connection): IO[MissionListResponse] =
    WorldResources.missions.traverse(mission => MissionTable.find(connection, mission.id, mission.version)
      .flatMap(found => IO.fromOption(found)(new IllegalStateException("Published mission is missing")))).map(MissionListResponse(_))

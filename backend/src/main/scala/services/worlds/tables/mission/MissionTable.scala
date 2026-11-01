package services.worlds.tables.mission
import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.Connection
import scala.util.Using
import services.worlds.objects.*
object MissionTable:
  def find(connection: Connection, id: MissionId, version: String): IO[Option[MissionDefinition]] = IO.blocking {
    Using.resource(connection.prepareStatement("select definition_json from world_missions where id=? and version=?")) { statement =>
      statement.setString(1, id.value); statement.setString(2, version)
      Using.resource(statement.executeQuery()) { rows =>
        Option.when(rows.next())(decode[MissionDefinition](rows.getString(1)).fold(error => throw new IllegalStateException("Stored mission is invalid", error), identity))
      }
    }
  }
  def insertPublished(connection: Connection, mission: MissionDefinition): IO[Unit] =
    for
      _ <- IO.blocking {
        Using.resource(connection.prepareStatement("insert into world_missions(id,version,definition_json) values(?,?,?::jsonb) on conflict(id,version) do nothing")) { statement =>
          statement.setString(1, mission.id.value); statement.setString(2, mission.version); statement.setString(3, mission.asJson.noSpaces); statement.executeUpdate(); ()
        }
      }
      stored <- find(connection, mission.id, mission.version)
      _ <- IO.raiseWhen(!stored.contains(mission))(new IllegalStateException("Published mission changed without a new version"))
    yield ()

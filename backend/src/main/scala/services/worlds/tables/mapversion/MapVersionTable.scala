package services.worlds.tables.mapversion

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.temporal.ChronoUnit
import java.util.UUID
import scala.util.Using
import services.player.objects.PlayerId
import services.worlds.objects.*

object MapVersionTable:
  private val columns = "v.id,v.map_id,v.version,v.title,v.world_json,v.created_at,m.built_in"
  def findAccessible(connection: Connection, playerId: PlayerId, id: MapVersionId): IO[Option[MapVersion]] =
    one(connection, s"select $columns from world_map_versions v join world_maps m on m.id=v.map_id where v.id=? and (m.built_in or m.owner_id=?)") { statement =>
      statement.setObject(1, id.value); statement.setObject(2, playerId.value)
    }
  def findBuiltIn(connection: Connection, id: MapVersionId): IO[Option[MapVersion]] =
    one(connection, s"select $columns from world_map_versions v join world_maps m on m.id=v.map_id where v.id=? and m.built_in")(_.setObject(1, id.value))
  def findByRevision(connection: Connection, id: MapId, revision: Int): IO[Option[MapVersion]] =
    one(connection, s"select $columns from world_map_versions v join world_maps m on m.id=v.map_id where v.map_id=? and v.source_revision=?") { statement =>
      statement.setObject(1, id.value); statement.setInt(2, revision)
    }
  /** Caller holds the owning draft row lock: max(version)+1 and same-revision reuse are serialized. */
  def create(connection: Connection, draft: MapDraft): IO[MapVersion] =
    for
      id <- IO(UUID.randomUUID())
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      _ <- IO.blocking {
        Using.resource(connection.prepareStatement("insert into world_map_versions(id,map_id,version,source_revision,title,world_json,created_at) select ?,?,coalesce(max(version),0)+1,?,?,?::jsonb,? from world_map_versions where map_id=?")) { statement =>
          statement.setObject(1, id); statement.setObject(2, draft.mapId.value); statement.setInt(3, draft.revision)
          statement.setString(4, draft.title); statement.setString(5, draft.world.asJson.noSpaces)
          statement.setTimestamp(6, Timestamp.from(now)); statement.setObject(7, draft.mapId.value); statement.executeUpdate(); ()
        }
      }
      found <- findByRevision(connection, draft.mapId, draft.revision)
      result <- IO.fromOption(found)(new IllegalStateException("Frozen version insert returned no row"))
    yield result
  def insertBuiltIn(connection: Connection, version: MapVersion): IO[Unit] =
    for
      _ <- IO.blocking {
        Using.resource(connection.prepareStatement("insert into world_map_versions(id,map_id,version,source_revision,title,world_json,created_at) values(?,?,?,0,?,?::jsonb,?) on conflict(id) do nothing")) { statement =>
          statement.setObject(1, version.id.value); statement.setObject(2, version.mapId.value); statement.setInt(3, version.version)
          statement.setString(4, version.title); statement.setString(5, version.world.asJson.noSpaces); statement.setTimestamp(6, Timestamp.from(version.createdAt)); statement.executeUpdate(); ()
        }
      }
      stored <- findBuiltIn(connection, version.id)
      _ <- IO.raiseWhen(!stored.contains(version))(new IllegalStateException("Published built-in map changed without a new version ID"))
    yield ()
  private def one(connection: Connection, sql: String)(bind: PreparedStatement => Unit): IO[Option[MapVersion]] = IO.blocking {
    Using.resource(connection.prepareStatement(sql)) { statement =>
      bind(statement)
      Using.resource(statement.executeQuery())(rows => Option.when(rows.next())(read(rows)))
    }
  }
  private def read(rows: ResultSet): MapVersion =
    val world = decode[WorldDefinition](rows.getString("world_json")).fold(error => throw new IllegalStateException("Stored map version is invalid", error), identity)
    MapVersion(MapVersionId(rows.getObject("id", classOf[UUID])), MapId(rows.getObject("map_id", classOf[UUID])), rows.getInt("version"),
      rows.getString("title"), world, rows.getTimestamp("created_at").toInstant, rows.getBoolean("built_in"))

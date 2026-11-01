package services.worlds.tables.mapdraft

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import scala.util.Using
import services.player.objects.PlayerId
import services.system.objects.HttpError
import services.worlds.objects.*

object MapDraftTable:
  private val columns = "id,title,revision,world_json,updated_at"
  def findOwned(connection: Connection, playerId: PlayerId, id: MapId, lock: Boolean = false): IO[Option[MapDraft]] =
    one(connection, s"select $columns from world_maps where id=? and owner_id=? and not built_in" + (if lock then " for update" else "")) { statement =>
      statement.setObject(1, id.value); statement.setObject(2, playerId.value)
    }

  def create(connection: Connection, playerId: PlayerId, world: WorldDefinition): IO[MapDraft] =
    for
      id <- IO(UUID.randomUUID())
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      result <- one(connection, s"insert into world_maps(id,owner_id,title,revision,world_json,updated_at,built_in) values(?,?,?,1,?::jsonb,?,false) returning $columns") { statement =>
        statement.setObject(1, id); statement.setObject(2, playerId.value); statement.setString(3, world.title)
        statement.setString(4, world.asJson.noSpaces); statement.setTimestamp(5, Timestamp.from(now))
      }
      created <- IO.fromOption(result)(new IllegalStateException("Draft insert returned no row"))
    yield created

  def update(connection: Connection, playerId: PlayerId, id: MapId, expectedRevision: Int, world: WorldDefinition): IO[MapDraft] =
    for
      now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      result <- one(connection, s"update world_maps set title=?,world_json=?::jsonb,revision=revision+1,updated_at=? where id=? and owner_id=? and revision=? and not built_in returning $columns") { statement =>
        statement.setString(1, world.title); statement.setString(2, world.asJson.noSpaces); statement.setTimestamp(3, Timestamp.from(now))
        statement.setObject(4, id.value); statement.setObject(5, playerId.value); statement.setInt(6, expectedRevision)
      }
      saved <- IO.fromOption(result)(HttpError.conflict("草稿已被其他操作更新，请刷新后重试。"))
    yield saved

  def listOwned(connection: Connection, playerId: PlayerId, offset: Int, limit: Int): IO[List[MapSummary]] = IO.blocking {
    val sql = """select m.id,m.title,m.revision,m.updated_at,m.built_in,
      (select v.id from world_map_versions v where v.map_id=m.id order by v.version desc limit 1) latest_version_id
      from world_maps m where m.owner_id=? and not m.built_in order by m.updated_at desc,m.id offset ? limit ?"""
    Using.resource(connection.prepareStatement(sql)) { statement =>
      statement.setObject(1, playerId.value); statement.setInt(2, offset); statement.setInt(3, limit)
      Using.resource(statement.executeQuery()) { rows =>
        val builder = List.newBuilder[MapSummary]
        while rows.next() do builder += MapSummary(MapId(rows.getObject("id", classOf[UUID])), rows.getString("title"), rows.getInt("revision"),
          Option(rows.getObject("latest_version_id", classOf[UUID])).map(MapVersionId(_)), rows.getTimestamp("updated_at").toInstant, rows.getBoolean("built_in"))
        builder.result()
      }
    }
  }
  def countOwned(connection: Connection, playerId: PlayerId): IO[Int] = IO.blocking {
    Using.resource(connection.prepareStatement("select count(*) from world_maps where owner_id=? and not built_in")) { statement =>
      statement.setObject(1, playerId.value)
      Using.resource(statement.executeQuery()) { rows => rows.next(); rows.getInt(1) }
    }
  }
  def insertBuiltIn(connection: Connection, version: MapVersion): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement("insert into world_maps(id,owner_id,title,revision,world_json,updated_at,built_in) values(?,null,?,0,?::jsonb,?,true) on conflict(id) do nothing")) { statement =>
      statement.setObject(1, version.mapId.value); statement.setString(2, version.title)
      statement.setString(3, version.world.asJson.noSpaces); statement.setTimestamp(4, Timestamp.from(version.createdAt)); statement.executeUpdate(); ()
    }
  }
  private def one(connection: Connection, sql: String)(bind: PreparedStatement => Unit): IO[Option[MapDraft]] = IO.blocking {
    Using.resource(connection.prepareStatement(sql)) { statement =>
      bind(statement)
      Using.resource(statement.executeQuery()) { rows => Option.when(rows.next())(read(rows)) }
    }
  }
  private def read(rows: ResultSet): MapDraft =
    val world = decode[WorldDefinition](rows.getString("world_json")).fold(error => throw new IllegalStateException("Stored map draft is invalid", error), identity)
    MapDraft(MapId(rows.getObject("id", classOf[UUID])), rows.getString("title"), rows.getInt("revision"), world, rows.getTimestamp("updated_at").toInstant)

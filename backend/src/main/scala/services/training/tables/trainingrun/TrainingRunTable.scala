package services.training.tables.trainingrun

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import scala.util.Using
import services.player.objects.PlayerId
import services.training.objects.{RunId, RunSelection, RunSetup, TerrainConfig, TrainingConfig, TrainingRun, TrainingRunStatus}

object TrainingRunTable:
  private val columns = "id, player_id, request_id, config_json, terrain_json, setup_json, status, started_at, completed_at"

  private val findOwnedSql = s"select $columns from training_runs where player_id = ? and id = ?"

  def findOwned(connection: Connection, playerId: PlayerId, runId: RunId): IO[Option[TrainingRun]] =
    queryOne(connection, findOwnedSql) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, runId.value)
    }

  private val lockOwnedSql = s"select $columns from training_runs where player_id = ? and id = ? for update"

  def lockOwned(connection: Connection, playerId: PlayerId, runId: RunId): IO[Option[TrainingRun]] =
    queryOne(connection, lockOwnedSql) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, runId.value)
    }

  private val findByRequestSql = s"select $columns from training_runs where player_id = ? and request_id = ?"

  def findByRequest(connection: Connection, playerId: PlayerId, requestId: UUID): IO[Option[TrainingRun]] =
    queryOne(connection, findByRequestSql) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, requestId)
    }

  private val requestSelectionSql = "select selection_json from training_runs where player_id = ? and request_id = ?"

  /** Only called after a run was found; null means the original request used the legacy contract. */
  def requestSelection(connection: Connection, playerId: PlayerId, requestId: UUID): IO[Option[RunSelection]] = IO.blocking {
    Using.resource(connection.prepareStatement(requestSelectionSql)) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, requestId)
      Using.resource(statement.executeQuery()) { rows =>
        if !rows.next() then throw new IllegalStateException("Run request disappeared before idempotency comparison")
        Option(rows.getString("selection_json")).map { json =>
          decode[RunSelection](json).fold(error => throw new IllegalStateException("Stored run selection is invalid", error), identity)
        }
      }
    }
  }

  private val insertIfAbsentSql =
    s"""insert into training_runs
      |(id, player_id, request_id, config_id, config_version, config_json, terrain_json, status, started_at, setup_json, selection_json)
      |values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'open', ?, ?::jsonb, ?::jsonb)
      |on conflict (player_id, request_id) do nothing returning $columns""".stripMargin

  /** ON CONFLICT waits for a competing insert; callers then read and compare the winning request. */
  def insertIfAbsent(
    connection: Connection,
    playerId: PlayerId,
    requestId: UUID,
    config: TrainingConfig,
    terrain: TerrainConfig,
    setup: Option[RunSetup] = None,
    selection: Option[RunSelection] = None
  ): IO[Option[TrainingRun]] =
    for
      id <- IO(UUID.randomUUID())
      startedAt <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
      run <- queryOne(connection, insertIfAbsentSql) { statement =>
        statement.setObject(1, id)
        statement.setObject(2, playerId.value)
        statement.setObject(3, requestId)
        statement.setObject(4, config.id.value)
        statement.setString(5, config.version)
        statement.setString(6, config.asJson.noSpaces)
        statement.setString(7, terrain.asJson.noSpaces)
        statement.setTimestamp(8, Timestamp.from(startedAt))
        statement.setString(9, setup.map(_.asJson.noSpaces).orNull)
        statement.setString(10, selection.map(_.asJson.noSpaces).orNull)
      }
    yield run

  private val markCompletedSql =
    "update training_runs set status = 'completed', completed_at = ? where player_id = ? and id = ? and status = 'open'"

  /** The caller holds lockOwned in the same transaction as inserting the result. */
  def markCompleted(connection: Connection, playerId: PlayerId, runId: RunId, completedAt: Instant): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(markCompletedSql)) { statement =>
      statement.setTimestamp(1, Timestamp.from(completedAt))
      statement.setObject(2, playerId.value)
      statement.setObject(3, runId.value)
      if statement.executeUpdate() != 1 then throw new IllegalStateException("Only an owned open run can be completed")
    }
  }

  private val markAbandonedSql =
    s"update training_runs set status = 'abandoned', completed_at = ? where player_id = ? and id = ? and status = 'open' returning $columns"

  def markAbandoned(connection: Connection, playerId: PlayerId, runId: RunId, abandonedAt: Instant): IO[TrainingRun] =
    queryOne(connection, markAbandonedSql) { statement =>
      statement.setTimestamp(1, Timestamp.from(abandonedAt))
      statement.setObject(2, playerId.value)
      statement.setObject(3, runId.value)
    }.flatMap(result => IO.fromOption(result)(new IllegalStateException("Only an owned open run can be abandoned")))

  private def queryOne(connection: Connection, sql: String)(bind: PreparedStatement => Unit): IO[Option[TrainingRun]] = IO.blocking {
    Using.resource(connection.prepareStatement(sql)) { statement =>
      bind(statement)
      Using.resource(statement.executeQuery())(rows => Option.when(rows.next())(readRun(rows)))
    }
  }

  private def readRun(rows: ResultSet): TrainingRun =
    val config = decode[TrainingConfig](rows.getString("config_json"))
      .fold(error => throw new IllegalStateException("Stored run configuration is invalid", error), identity)
    val terrain = decode[TerrainConfig](rows.getString("terrain_json"))
      .fold(error => throw new IllegalStateException("Stored run terrain is invalid", error), identity)
    val status = TrainingRunStatus.fromString(rows.getString("status"))
      .fold(error => throw new IllegalStateException(error), identity)
    val setup = Option(rows.getString("setup_json")).map { json =>
      decode[RunSetup](json).fold(error => throw new IllegalStateException("Stored run setup is invalid", error), identity)
    }
    TrainingRun(
      RunId(rows.getObject("id", classOf[UUID])),
      PlayerId(rows.getObject("player_id", classOf[UUID])),
      rows.getObject("request_id", classOf[UUID]),
      config,
      terrain,
      status,
      rows.getTimestamp("started_at").toInstant,
      Option(rows.getTimestamp("completed_at")).map(_.toInstant),
      setup
    )

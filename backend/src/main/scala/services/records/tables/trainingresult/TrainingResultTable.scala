package services.records.tables.trainingresult

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import services.player.objects.PlayerId
import services.records.objects.{ObjectiveProgress, ResultOutcome, TrainingResult}
import services.training.objects.{RunId, RunSetup, TerrainConfig, TrainingConfigId}
import java.sql.{Connection, ResultSet, Timestamp}
import java.util.UUID
import scala.util.Using

object TrainingResultTable:
  private val findOwnedSql: String =
    "SELECT * FROM training_results WHERE player_id = ? AND run_id = ?"

  def findOwned(connection: Connection, playerId: PlayerId, runId: RunId): IO[Option[TrainingResult]] = IO.blocking {
    Using.resource(connection.prepareStatement(findOwnedSql)) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, runId.value)
      Using.resource(statement.executeQuery()) { rows =>
        if rows.next() then Some(readRow(rows)) else None
      }
    }
  }

  private val insertSql: String =
    """
      |INSERT INTO training_results
      |  (run_id, player_id, config_id, config_version, terrain_json, outcome,
      |   shots_fired, hits, destroyed, elapsed_ms, accuracy, submitted_at, objective_progress_json, setup_json)
      |VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
      |RETURNING *
      |""".stripMargin

  def insert(connection: Connection, result: TrainingResult): IO[TrainingResult] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, result.runId.value)
      statement.setObject(2, result.playerId.value)
      statement.setObject(3, result.configId.value)
      statement.setString(4, result.configVersion)
      statement.setString(5, result.terrain.asJson.noSpaces)
      statement.setString(6, ResultOutcome.toString(result.outcome))
      statement.setInt(7, result.shotsFired)
      statement.setInt(8, result.hits)
      statement.setInt(9, result.destroyed)
      statement.setLong(10, result.elapsedMs)
      statement.setDouble(11, result.accuracy)
      statement.setTimestamp(12, Timestamp.from(result.submittedAt))
      statement.setString(13, result.objectiveProgress.map(_.asJson.noSpaces).orNull)
      statement.setString(14, result.setup.map(_.asJson.noSpaces).orNull)
      Using.resource(statement.executeQuery()) { rows =>
        if !rows.next() then throw new IllegalStateException("插入训练结果未返回记录")
        readRow(rows)
      }
    }
  }

  private val listOwnedSql: String =
    """
      |SELECT * FROM training_results WHERE player_id = ?
      |ORDER BY submitted_at DESC, run_id ASC LIMIT ? OFFSET ?
      |""".stripMargin

  def listOwned(connection: Connection, playerId: PlayerId, offset: Int, limit: Int): IO[List[TrainingResult]] = IO.blocking {
    Using.resource(connection.prepareStatement(listOwnedSql)) { statement =>
      statement.setObject(1, playerId.value)
      statement.setInt(2, limit)
      statement.setInt(3, offset)
      Using.resource(statement.executeQuery()) { rows =>
        val results = List.newBuilder[TrainingResult]
        while rows.next() do results += readRow(rows)
        results.result()
      }
    }
  }

  private val countOwnedSql: String =
    "SELECT COUNT(*) AS total FROM training_results WHERE player_id = ?"

  def countOwned(connection: Connection, playerId: PlayerId): IO[Long] = IO.blocking {
    Using.resource(connection.prepareStatement(countOwnedSql)) { statement =>
      statement.setObject(1, playerId.value)
      Using.resource(statement.executeQuery()) { rows =>
        if !rows.next() then throw new IllegalStateException("统计训练结果未返回记录")
        rows.getLong("total")
      }
    }
  }

  private val findBestOwnedSql: String =
    """
      |SELECT * FROM training_results
      |WHERE player_id = ? AND config_id = ? AND config_version = ?
      |  AND terrain_json = ?::jsonb AND outcome = 'victory' AND setup_json IS NULL
      |ORDER BY elapsed_ms ASC, accuracy DESC, submitted_at ASC, run_id ASC
      |LIMIT 1
      |""".stripMargin

  def findBestOwned(
    connection: Connection,
    playerId: PlayerId,
    configId: TrainingConfigId,
    configVersion: String,
    terrain: TerrainConfig
  ): IO[Option[TrainingResult]] = IO.blocking {
    Using.resource(connection.prepareStatement(findBestOwnedSql)) { statement =>
      statement.setObject(1, playerId.value)
      statement.setObject(2, configId.value)
      statement.setString(3, configVersion)
      statement.setString(4, terrain.asJson.noSpaces)
      Using.resource(statement.executeQuery()) { rows =>
        if rows.next() then Some(readRow(rows)) else None
      }
    }
  }

  private def readRow(rows: ResultSet): TrainingResult =
    val terrain = decode[TerrainConfig](rows.getString("terrain_json")).fold(
      error => throw new IllegalStateException("数据库中的结果地形格式不正确", error),
      identity
    )
    val outcome = ResultOutcome.fromString(rows.getString("outcome")).fold(
      error => throw new IllegalStateException(error),
      identity
    )
    TrainingResult(
      runId = RunId(rows.getObject("run_id", classOf[UUID])),
      playerId = PlayerId(rows.getObject("player_id", classOf[UUID])),
      configId = TrainingConfigId(rows.getObject("config_id", classOf[UUID])),
      configVersion = rows.getString("config_version"),
      terrain = terrain,
      outcome = outcome,
      shotsFired = rows.getInt("shots_fired"),
      hits = rows.getInt("hits"),
      destroyed = rows.getInt("destroyed"),
      elapsedMs = rows.getLong("elapsed_ms"),
      accuracy = rows.getDouble("accuracy"),
      submittedAt = rows.getTimestamp("submitted_at").toInstant,
      objectiveProgress = Option(rows.getString("objective_progress_json")).map(text => decode[ObjectiveProgress](text).fold(
        error => throw new IllegalStateException("数据库中的目标进度格式不正确", error), identity)),
      setup = Option(rows.getString("setup_json")).map(text => decode[RunSetup](text).fold(
        error => throw new IllegalStateException("数据库中的冻结任务格式不正确", error), identity))
    )

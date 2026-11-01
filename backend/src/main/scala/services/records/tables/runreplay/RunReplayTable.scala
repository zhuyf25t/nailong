package services.records.tables.runreplay
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.{ReplayEnvelope, StoredRunReplay}
object RunReplayTable:
  private val findSql = "SELECT format_version, content_hash, payload_json FROM run_replays WHERE player_id=? AND run_id=?"
  private val insertSql = "INSERT INTO run_replays(run_id,player_id,format_version,content_hash,payload_json) VALUES (?,?,?,?,?)"
  def findOwned(connection: Connection, playerId: PlayerId, runId: RunId): IO[Option[StoredRunReplay]] = IO.blocking {
    Using.resource(connection.prepareStatement(findSql)) { statement =>
      statement.setObject(1, playerId.value); statement.setObject(2, runId.value)
      Using.resource(statement.executeQuery()) { rows =>
        if !rows.next() then None
        else Some(StoredRunReplay(rows.getInt("format_version"), ReplayEnvelope(rows.getString("content_hash"), rows.getString("payload_json"))))
      }
    }
  }
  def insert(connection: Connection, playerId: PlayerId, runId: RunId, stored: StoredRunReplay): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, runId.value); statement.setObject(2, playerId.value)
      statement.setInt(3, stored.formatVersion); statement.setString(4, stored.replay.contentHash); statement.setString(5, stored.replay.payloadJson)
      statement.executeUpdate(); ()
    }
  }

package services.records.tables.runeventsummary
import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.Connection
import scala.util.Using
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.{RunEventSummary, StoredRunEvents}
object RunEventSummaryTable:
  private val findSql = "SELECT content_hash, summary_json FROM run_event_summaries WHERE player_id=? AND run_id=?"
  private val insertSql = "INSERT INTO run_event_summaries(run_id,player_id,content_hash,summary_json) VALUES (?,?,?,?::jsonb)"
  def findOwned(connection: Connection, playerId: PlayerId, runId: RunId): IO[Option[StoredRunEvents]] = IO.blocking {
    Using.resource(connection.prepareStatement(findSql)) { statement =>
      statement.setObject(1, playerId.value); statement.setObject(2, runId.value)
      Using.resource(statement.executeQuery()) { rows =>
        if !rows.next() then None
        else Some(StoredRunEvents(decode[RunEventSummary](rows.getString("summary_json")).fold(
          error => throw new IllegalStateException("事件记录无法解码", error), identity), rows.getString("content_hash")))
      }
    }
  }
  def insert(connection: Connection, playerId: PlayerId, runId: RunId, stored: StoredRunEvents): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, runId.value); statement.setObject(2, playerId.value)
      statement.setString(3, stored.contentHash); statement.setString(4, stored.summary.asJson.noSpaces)
      statement.executeUpdate(); ()
    }
  }

package services.records.tables.runeventsummary
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
object RunEventSummaryTableInitializer:
  private val initializeSql = """
    CREATE TABLE IF NOT EXISTS run_event_summaries (
      run_id UUID PRIMARY KEY REFERENCES training_results(run_id),
      player_id UUID NOT NULL REFERENCES players(id),
      content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      summary_json JSONB NOT NULL CHECK (octet_length(summary_json::text) <= 2097152),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS run_event_summaries_owner_idx ON run_event_summaries(player_id, run_id);
  """
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement())(_.execute(initializeSql)); ()
  }

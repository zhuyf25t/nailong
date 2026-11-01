package services.records.tables.runreplay
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
object RunReplayTableInitializer:
  private val initializeSql = """
    CREATE TABLE IF NOT EXISTS run_replays (
      run_id UUID PRIMARY KEY REFERENCES training_results(run_id),
      player_id UUID NOT NULL REFERENCES players(id),
      content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      format_version INTEGER NOT NULL CHECK (format_version > 0),
      payload_json TEXT NOT NULL CHECK (octet_length(payload_json) <= 6291456),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS run_replays_owner_idx ON run_replays(player_id, run_id);
  """
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement())(_.execute(initializeSql)); ()
  }

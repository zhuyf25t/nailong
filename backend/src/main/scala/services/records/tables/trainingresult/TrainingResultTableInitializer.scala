package services.records.tables.trainingresult

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object TrainingResultTableInitializer:
  private val initializeSql: String =
    """
      |CREATE TABLE IF NOT EXISTS training_results (
      |  run_id UUID PRIMARY KEY REFERENCES training_runs(id),
      |  player_id UUID NOT NULL REFERENCES players(id),
      |  config_id UUID NOT NULL,
      |  config_version TEXT NOT NULL,
      |  terrain_json JSONB NOT NULL,
      |  outcome TEXT NOT NULL CHECK (outcome IN ('victory', 'defeat')),
      |  shots_fired INTEGER NOT NULL CHECK (shots_fired BETWEEN 0 AND 1000000),
      |  hits INTEGER NOT NULL CHECK (hits >= 0 AND hits <= shots_fired),
      |  destroyed INTEGER NOT NULL CHECK (destroyed >= 0),
      |  elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 86400000),
      |  accuracy DOUBLE PRECISION NOT NULL CHECK (accuracy >= 0 AND accuracy <= 1),
      |  submitted_at TIMESTAMPTZ NOT NULL,
      |  FOREIGN KEY (config_id, config_version) REFERENCES training_configs(id, version)
      |);
      |CREATE INDEX IF NOT EXISTS training_results_history_idx
      |  ON training_results (player_id, submitted_at DESC, run_id ASC);
      |CREATE INDEX IF NOT EXISTS training_results_best_idx
      |  ON training_results (player_id, config_id, config_version, elapsed_ms ASC, accuracy DESC, submitted_at ASC, run_id ASC)
      |  WHERE outcome = 'victory';
      |""".stripMargin

  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement())(_.execute(initializeSql))
    ()
  }

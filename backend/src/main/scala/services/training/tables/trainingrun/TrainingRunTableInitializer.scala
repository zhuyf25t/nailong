package services.training.tables.trainingrun

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object TrainingRunTableInitializer:
  private val initializeSql =
    """create table if not exists training_runs (
      |id uuid primary key,
      |player_id uuid not null references players(id),
      |request_id uuid not null,
      |config_id uuid not null,
      |config_version text not null,
      |config_json jsonb not null,
      |terrain_json jsonb not null,
      |setup_json jsonb,
      |selection_json jsonb,
      |status text not null check (status in ('open', 'completed', 'abandoned')),
      |started_at timestamptz not null,
      |completed_at timestamptz,
      |unique (player_id, request_id),
      |foreign key (config_id, config_version) references training_configs(id, version),
      |check ((status = 'open' and completed_at is null) or (status <> 'open' and completed_at is not null))
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement =>
      statement.execute(initializeSql)
      // Nullable additions preserve historical runs and may be applied repeatedly.
      statement.execute("alter table training_runs add column if not exists setup_json jsonb")
      statement.execute("alter table training_runs add column if not exists selection_json jsonb")
      ()
    }
  }

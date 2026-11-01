package services.training.tables.trainingconfig

import cats.effect.IO
import java.sql.Connection
import scala.util.Using
import services.training.utils.TrainingConfigResource

object TrainingConfigTableInitializer:
  private val initializeSql =
    """create table if not exists training_configs (
      |id uuid not null,
      |version text not null check (length(version) > 0),
      |config_json jsonb not null,
      |primary key (id, version)
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- IO.blocking(Using.resource(connection.createStatement())(_.execute(initializeSql)))
      bundled <- TrainingConfigResource.load()
      _ <- TrainingConfigTable.insertIfAbsent(connection, bundled)
      // Conflict leaves the old row intact. A changed payload under one version fails startup.
      _ <- TrainingConfigTable.current(connection)
    yield ()

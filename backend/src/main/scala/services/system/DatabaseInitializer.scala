package services.system

import cats.effect.IO
import java.sql.Connection
import services.player.tables.player.PlayerTableInitializer
import services.player.tables.playersession.PlayerSessionTableInitializer
import services.training.tables.trainingconfig.TrainingConfigTableInitializer
import services.training.tables.trainingrun.TrainingRunTableInitializer
import services.records.tables.trainingresult.TrainingResultTableInitializer
import services.records.tables.runeventsummary.RunEventSummaryTableInitializer
import services.records.tables.runreplay.RunReplayTableInitializer
import services.worlds.WorldInitializer

/** Initialization follows foreign-key dependencies; DDL and config seed commit together. */
object DatabaseInitializer:
  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- PlayerTableInitializer.initialize(connection)
      _ <- PlayerSessionTableInitializer.initialize(connection)
      _ <- TrainingConfigTableInitializer.initialize(connection)
      _ <- WorldInitializer.initialize(connection)
      _ <- TrainingRunTableInitializer.initialize(connection)
      _ <- TrainingResultTableInitializer.initialize(connection)
      _ <- RunEventSummaryTableInitializer.initialize(connection)
      _ <- RunReplayTableInitializer.initialize(connection)
    yield ()

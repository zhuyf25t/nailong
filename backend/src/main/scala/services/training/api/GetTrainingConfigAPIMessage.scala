package services.training.api

import cats.effect.IO
import java.sql.Connection
import services.system.api.NoRequestMessage
import services.training.objects.TrainingConfig
import services.training.tables.trainingconfig.TrainingConfigTable

/** Public current rules. No empty request DTO is needed. */
final case class GetTrainingConfigAPIMessage() extends NoRequestMessage[TrainingConfig]:
  override def plan(connection: Connection): IO[TrainingConfig] = TrainingConfigTable.current(connection)

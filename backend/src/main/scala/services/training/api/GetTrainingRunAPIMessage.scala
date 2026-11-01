package services.training.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.{RunId, TrainingRun}
import services.training.tables.trainingrun.TrainingRunTable

final case class GetTrainingRunAPIMessage(playerId: PlayerId, runId: RunId) extends APIWithTokenMessage[TrainingRun]:
  override def plan(connection: Connection): IO[TrainingRun] =
    TrainingRunTable.findOwned(connection, playerId, runId)
      .flatMap(run => IO.fromOption(run)(HttpError.notFound("局次不存在。")))

object GetTrainingRunAPIMessage:
  given Decoder[GetTrainingRunAPIMessage] = deriveDecoder[GetTrainingRunAPIMessage]

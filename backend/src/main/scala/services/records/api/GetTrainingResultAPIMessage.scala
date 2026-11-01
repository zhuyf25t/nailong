package services.records.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.PlayerId
import services.records.objects.apiTypes.ResultLookupResponse
import services.records.tables.trainingresult.TrainingResultTable
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.RunId
import services.training.tables.trainingrun.TrainingRunTable
import java.sql.Connection

final case class GetTrainingResultAPIMessage(playerId: PlayerId, runId: RunId)
  extends APIWithTokenMessage[ResultLookupResponse]:
  override def plan(connection: Connection): IO[ResultLookupResponse] =
    for
      run <- TrainingRunTable.findOwned(connection, playerId, runId)
      _ <- IO.fromOption(run)(HttpError.notFound("找不到本人的训练局次"))
      result <- TrainingResultTable.findOwned(connection, playerId, runId)
    yield ResultLookupResponse(result)

object GetTrainingResultAPIMessage:
  given Decoder[GetTrainingResultAPIMessage] = deriveDecoder[GetTrainingResultAPIMessage]

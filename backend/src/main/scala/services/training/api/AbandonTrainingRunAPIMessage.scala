package services.training.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import java.time.temporal.ChronoUnit
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.{RunId, TrainingRunStatus}
import services.training.objects.apiTypes.AbandonRunResponse
import services.training.tables.trainingrun.TrainingRunTable

final case class AbandonTrainingRunAPIMessage(playerId: PlayerId, runId: RunId) extends APIWithTokenMessage[AbandonRunResponse]:
  override def plan(connection: Connection): IO[AbandonRunResponse] =
    for
      locked <- TrainingRunTable.lockOwned(connection, playerId, runId)
      run <- IO.fromOption(locked)(HttpError.notFound("局次不存在。"))
      abandoned <- run.status match
        case TrainingRunStatus.Abandoned => IO.pure(run)
        case TrainingRunStatus.Completed => IO.raiseError(HttpError.conflict("已保存成绩的局次不能放弃。"))
        case TrainingRunStatus.Open =>
          IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
            .flatMap(now => TrainingRunTable.markAbandoned(connection, playerId, runId, now))
    yield AbandonRunResponse(abandoned)

object AbandonTrainingRunAPIMessage:
  given Decoder[AbandonTrainingRunAPIMessage] = deriveDecoder[AbandonTrainingRunAPIMessage]

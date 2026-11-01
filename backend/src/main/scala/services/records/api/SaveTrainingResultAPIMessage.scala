package services.records.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.PlayerId
import services.records.objects.{ResultSubmission, TrainingResult}
import services.records.tables.trainingresult.TrainingResultTable
import services.records.utils.ResultValidation
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.{RunId, TrainingRunStatus}
import services.training.tables.trainingrun.TrainingRunTable
import java.sql.Connection
import java.time.temporal.ChronoUnit

/** The router owns this transaction; its row lock serializes save, retry and abandon. */
final case class SaveTrainingResultAPIMessage(
  playerId: PlayerId,
  runId: RunId,
  submission: ResultSubmission
) extends APIWithTokenMessage[TrainingResult]:
  override def plan(connection: Connection): IO[TrainingResult] =
    for
      maybeRun <- TrainingRunTable.lockOwned(connection, playerId, runId)
      run <- IO.fromOption(maybeRun)(HttpError.notFound("找不到本人的训练局次"))
      previous <- TrainingResultTable.findOwned(connection, playerId, runId)
      result <- previous match
        case Some(saved) if ResultValidation.sameSubmission(saved, submission) => IO.pure(saved)
        case Some(_) => IO.raiseError(HttpError.conflict("该局已有不同的结果，不能覆盖"))
        case None =>
          for
            _ <- run.status match
              case TrainingRunStatus.Open => IO.unit
              case TrainingRunStatus.Completed => IO.raiseError(HttpError.conflict("该局已经结束"))
              case TrainingRunStatus.Abandoned => IO.raiseError(HttpError.conflict("已放弃的局次不能保存结果"))
            _ <- ResultValidation.validateSubmission(run, submission)
            now <- IO.realTimeInstant.map(_.truncatedTo(ChronoUnit.MICROS))
            saved <- TrainingResultTable.insert(connection, TrainingResult(
              runId = run.id,
              playerId = playerId,
              configId = run.config.id,
              configVersion = run.config.version,
              terrain = run.terrain,
              outcome = submission.outcome,
              shotsFired = submission.shotsFired,
              hits = submission.hits,
              destroyed = submission.destroyed,
              elapsedMs = submission.elapsedMs,
              accuracy = if submission.shotsFired == 0 then 0.0 else submission.hits.toDouble / submission.shotsFired,
              submittedAt = now
            ))
            _ <- TrainingRunTable.markCompleted(connection, playerId, runId, now)
          yield saved
    yield result

object SaveTrainingResultAPIMessage:
  given Decoder[SaveTrainingResultAPIMessage] = deriveDecoder[SaveTrainingResultAPIMessage]

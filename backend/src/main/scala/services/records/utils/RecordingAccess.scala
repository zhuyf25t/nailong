package services.records.utils
import cats.effect.IO
import java.sql.Connection
import services.player.objects.PlayerId
import services.training.objects.{RunId, TrainingRun}
import services.training.tables.trainingrun.TrainingRunTable
import services.records.objects.TrainingResult
import services.records.tables.trainingresult.TrainingResultTable
import services.system.objects.HttpError
object RecordingAccess:
  def ownedRun(connection: Connection, playerId: PlayerId, runId: RunId): IO[TrainingRun] =
    TrainingRunTable.findOwned(connection, playerId, runId).flatMap(IO.fromOption(_)(HttpError.notFound("找不到本人的训练局次")))
  /** The run row lock serializes immutable recording writes independently of score saving. */
  def completedRun(connection: Connection, playerId: PlayerId, runId: RunId): IO[(TrainingRun, TrainingResult)] =
    for
      found <- TrainingRunTable.lockOwned(connection, playerId, runId)
      run <- IO.fromOption(found)(HttpError.notFound("找不到本人的训练局次"))
      result <- TrainingResultTable.findOwned(connection, playerId, runId).flatMap(IO.fromOption(_)(HttpError.conflict("请先保存成绩，再上传过程记录")))
      _ <- IO.raiseWhen(run.setup.isEmpty)(HttpError.conflict("旧版局次没有冻结的世界，不能补造过程记录"))
    yield (run, result)

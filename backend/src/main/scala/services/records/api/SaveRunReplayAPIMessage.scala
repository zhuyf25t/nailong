package services.records.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.{ReplayEnvelope, StoredRunReplay}
import services.records.objects.apiTypes.RecordingSaveResponse
import services.records.tables.runreplay.RunReplayTable
import services.records.tables.runeventsummary.RunEventSummaryTable
import services.records.utils.{RecordingAccess, RecordingValidation}
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
final case class SaveRunReplayAPIMessage(playerId: PlayerId, runId: RunId, replay: ReplayEnvelope) extends APIWithTokenMessage[RecordingSaveResponse]:
  def plan(connection: Connection): IO[RecordingSaveResponse] =
    for
      context <- RecordingAccess.completedRun(connection, playerId, runId)
      payload <- RecordingValidation.validateReplay(context._1, context._2, replay)
      summary <- RunEventSummaryTable.findOwned(connection, playerId, runId)
      _ <- summary.fold(IO.unit)(stored => RecordingValidation.validateConsistency(stored.summary, payload))
      prior <- RunReplayTable.findOwned(connection, playerId, runId)
      _ <- prior match
        case Some(value) if value.replay == replay => IO.unit
        case Some(_) => IO.raiseError(HttpError.conflict("该局已有不同的回放内容，不能覆盖"))
        case None => RunReplayTable.insert(connection, playerId, runId, StoredRunReplay(payload.manifest.formatVersion, replay))
    yield RecordingSaveResponse("saved", runId, replay.contentHash)
object SaveRunReplayAPIMessage:
  given Decoder[SaveRunReplayAPIMessage] = deriveDecoder[SaveRunReplayAPIMessage]

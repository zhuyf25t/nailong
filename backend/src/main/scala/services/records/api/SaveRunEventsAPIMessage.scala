package services.records.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.{RunEventSummary, StoredRunEvents}
import services.records.objects.apiTypes.RecordingSaveResponse
import services.records.tables.runeventsummary.RunEventSummaryTable
import services.records.tables.runreplay.RunReplayTable
import services.records.utils.{RecordingAccess, RecordingValidation}
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
final case class SaveRunEventsAPIMessage(playerId: PlayerId, runId: RunId, summary: RunEventSummary) extends APIWithTokenMessage[RecordingSaveResponse]:
  def plan(connection: Connection): IO[RecordingSaveResponse] =
    for
      context <- RecordingAccess.completedRun(connection, playerId, runId)
      _ <- RecordingValidation.validateSummary(context._1, context._2, summary)
      replay <- RunReplayTable.findOwned(connection, playerId, runId)
      _ <- replay.fold(IO.unit)(RecordingValidation.validateStoredReplayConsistency(summary, _))
      prior <- RunEventSummaryTable.findOwned(connection, playerId, runId)
      hash <- prior match
        case Some(value) if value.summary == summary => IO.pure(value.contentHash)
        case Some(_) => IO.raiseError(HttpError.conflict("该局已有不同的事件记录，不能覆盖"))
        case None =>
          val value = StoredRunEvents(summary, RecordingValidation.summaryHash(summary))
          RunEventSummaryTable.insert(connection, playerId, runId, value).as(value.contentHash)
    yield RecordingSaveResponse("saved", runId, hash)
object SaveRunEventsAPIMessage:
  given Decoder[SaveRunEventsAPIMessage] = deriveDecoder[SaveRunEventsAPIMessage]

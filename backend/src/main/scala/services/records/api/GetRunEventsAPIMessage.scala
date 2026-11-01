package services.records.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.apiTypes.RunEventsLookupResponse
import services.records.tables.runeventsummary.RunEventSummaryTable
import services.records.utils.RecordingAccess
import services.system.api.APIWithTokenMessage
final case class GetRunEventsAPIMessage(playerId: PlayerId, runId: RunId) extends APIWithTokenMessage[RunEventsLookupResponse]:
  def plan(connection: Connection): IO[RunEventsLookupResponse] =
    for
      _ <- RecordingAccess.ownedRun(connection, playerId, runId)
      value <- RunEventSummaryTable.findOwned(connection, playerId, runId)
    yield value.fold[RunEventsLookupResponse](RunEventsLookupResponse.MissingLegacy)(stored => RunEventsLookupResponse.Available(stored.summary))
object GetRunEventsAPIMessage:
  given Decoder[GetRunEventsAPIMessage] = deriveDecoder[GetRunEventsAPIMessage]

package services.records.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.training.objects.RunId
import services.records.objects.apiTypes.RunReplayLookupResponse
import services.records.tables.runreplay.RunReplayTable
import services.records.utils.RecordingAccess
import services.system.api.APIWithTokenMessage
final case class GetRunReplayAPIMessage(playerId: PlayerId, runId: RunId) extends APIWithTokenMessage[RunReplayLookupResponse]:
  def plan(connection: Connection): IO[RunReplayLookupResponse] =
    for
      _ <- RecordingAccess.ownedRun(connection, playerId, runId)
      value <- RunReplayTable.findOwned(connection, playerId, runId)
    yield value match
      case None => RunReplayLookupResponse.MissingLegacy
      case Some(stored) if stored.formatVersion != 1 => RunReplayLookupResponse.UnsupportedVersion(stored.formatVersion)
      case Some(stored) => RunReplayLookupResponse.Available(stored.replay)
object GetRunReplayAPIMessage:
  given Decoder[GetRunReplayAPIMessage] = deriveDecoder[GetRunReplayAPIMessage]

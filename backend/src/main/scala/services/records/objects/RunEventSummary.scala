package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class RunEventSummary(formatVersion: Int, runDurationMs: Long, resultAtMs: Long, truncated: Boolean, events: List[RunEvent])
object RunEventSummary:
  given Encoder[RunEventSummary] = deriveEncoder[RunEventSummary]
  given Decoder[RunEventSummary] = deriveDecoder[RunEventSummary]

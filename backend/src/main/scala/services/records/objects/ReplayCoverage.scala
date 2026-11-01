package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class ReplayCoverage(kind: String, reason: Option[String], fromMs: Long, toMs: Long, runDurationMs: Long, resultAtMs: Long)
object ReplayCoverage:
  given Encoder[ReplayCoverage] = deriveEncoder[ReplayCoverage]
  given Decoder[ReplayCoverage] = deriveDecoder[ReplayCoverage]

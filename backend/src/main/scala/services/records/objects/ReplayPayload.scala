package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class ReplayPayload(manifest: ReplayManifest, frames: List[ReplayFrame], events: List[RunEvent])
object ReplayPayload:
  given Encoder[ReplayPayload] = deriveEncoder[ReplayPayload]
  given Decoder[ReplayPayload] = deriveDecoder[ReplayPayload]

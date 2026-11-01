package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class ReplayEnvelope(contentHash: String, payloadJson: String)
object ReplayEnvelope:
  given Encoder[ReplayEnvelope] = deriveEncoder[ReplayEnvelope]
  given Decoder[ReplayEnvelope] = deriveDecoder[ReplayEnvelope]

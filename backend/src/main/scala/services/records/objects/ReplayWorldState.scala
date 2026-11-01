package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class ReplayWorldState(openGateIds: List[String], beaconActivated: Boolean, extracted: Boolean)
object ReplayWorldState:
  given Encoder[ReplayWorldState] = deriveEncoder[ReplayWorldState]
  given Decoder[ReplayWorldState] = deriveDecoder[ReplayWorldState]

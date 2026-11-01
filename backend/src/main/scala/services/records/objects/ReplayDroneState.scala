package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class ReplayDroneState(id: String, position: Point3, yaw: Double, hp: Int, state: String, flight: String, stunned: Option[Boolean] = None)
object ReplayDroneState:
  given Encoder[ReplayDroneState] = deriveEncoder[ReplayDroneState]
  given Decoder[ReplayDroneState] = deriveDecoder[ReplayDroneState]

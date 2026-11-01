package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class ReplayToolState(id: String, kind: String, position: Point3, radius: Double, remainingMs: Long, active: Boolean)
object ReplayToolState:
  given Encoder[ReplayToolState] = deriveEncoder[ReplayToolState]
  given Decoder[ReplayToolState] = deriveDecoder[ReplayToolState]

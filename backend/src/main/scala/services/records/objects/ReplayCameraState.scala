package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class ReplayCameraState(position: Point3, target: Point3, fov: Double)
object ReplayCameraState:
  given Encoder[ReplayCameraState] = deriveEncoder[ReplayCameraState]
  given Decoder[ReplayCameraState] = deriveDecoder[ReplayCameraState]

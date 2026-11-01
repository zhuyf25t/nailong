package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class ReplayPlayerState(position: Point3, yaw: Double, animation: String, animationTime: Double, aimWeight: Double, alive: Boolean)
object ReplayPlayerState:
  given Encoder[ReplayPlayerState] = deriveEncoder[ReplayPlayerState]
  given Decoder[ReplayPlayerState] = deriveDecoder[ReplayPlayerState]

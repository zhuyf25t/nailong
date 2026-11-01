package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class ReplayProjectileState(id: String, position: Point3, direction: Point3)
object ReplayProjectileState:
  given Encoder[ReplayProjectileState] = deriveEncoder[ReplayProjectileState]
  given Decoder[ReplayProjectileState] = deriveDecoder[ReplayProjectileState]

package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.Point3
final case class RunEvent(seq: Int, tMs: Long, kind: String, actorId: Option[String], targetId: Option[String], position: Option[Point3], value: Option[Double], detail: Option[String])
object RunEvent:
  given Encoder[RunEvent] = deriveEncoder[RunEvent]
  given Decoder[RunEvent] = deriveDecoder[RunEvent]

package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
final case class MapValidationIssue(code: String, message: String, objectId: Option[String])
object MapValidationIssue:
  given Encoder[MapValidationIssue] = deriveEncoder[MapValidationIssue]
  given Decoder[MapValidationIssue] = deriveDecoder[MapValidationIssue]

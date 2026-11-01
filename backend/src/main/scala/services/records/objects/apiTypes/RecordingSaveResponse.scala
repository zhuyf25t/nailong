package services.records.objects.apiTypes
import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder
import services.training.objects.RunId
final case class RecordingSaveResponse(status: String, runId: RunId, contentHash: String)
object RecordingSaveResponse:
  given Encoder[RecordingSaveResponse] = deriveEncoder[RecordingSaveResponse]

package services.records.objects.apiTypes
import io.circe.{Encoder, Json}
import io.circe.syntax.*
import services.records.objects.RunEventSummary
enum RunEventsLookupResponse:
  case Available(summary: RunEventSummary)
  case MissingLegacy
object RunEventsLookupResponse:
  given Encoder[RunEventsLookupResponse] = Encoder.instance {
    case RunEventsLookupResponse.Available(summary) => Json.obj("status" -> Json.fromString("available"), "summary" -> summary.asJson)
    case RunEventsLookupResponse.MissingLegacy => Json.obj("status" -> Json.fromString("missing_legacy"))
  }

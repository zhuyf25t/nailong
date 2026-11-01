package services.records.objects.apiTypes
import io.circe.{Encoder, Json}
import io.circe.syntax.*
import services.records.objects.ReplayEnvelope
enum RunReplayLookupResponse:
  case Available(replay: ReplayEnvelope)
  case MissingLegacy
  case UnsupportedVersion(formatVersion: Int)
object RunReplayLookupResponse:
  given Encoder[RunReplayLookupResponse] = Encoder.instance {
    case RunReplayLookupResponse.Available(replay) => Json.obj("status" -> Json.fromString("available"), "replay" -> replay.asJson)
    case RunReplayLookupResponse.MissingLegacy => Json.obj("status" -> Json.fromString("missing_legacy"))
    case RunReplayLookupResponse.UnsupportedVersion(version) => Json.obj("status" -> Json.fromString("unsupported_version"), "formatVersion" -> Json.fromInt(version))
  }

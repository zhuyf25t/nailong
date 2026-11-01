package services.worlds.objects
import io.circe.{Decoder, DecodingFailure, Encoder, Json}

enum MissionObjective:
  case ClearDrones
  case ActivateExtract(beaconId: String, extractionId: String)

object MissionObjective:
  given Encoder[MissionObjective] = Encoder.instance {
    case MissionObjective.ClearDrones => Json.obj("kind" -> Json.fromString("clear_drones"))
    case MissionObjective.ActivateExtract(beacon, extraction) => Json.obj(
      "kind" -> Json.fromString("activate_extract"), "beaconId" -> Json.fromString(beacon), "extractionId" -> Json.fromString(extraction))
  }
  given Decoder[MissionObjective] = Decoder.instance { cursor =>
    cursor.get[String]("kind").flatMap {
      case "clear_drones" => Right(MissionObjective.ClearDrones)
      case "activate_extract" => for
        beacon <- cursor.get[String]("beaconId")
        extraction <- cursor.get[String]("extractionId")
      yield MissionObjective.ActivateExtract(beacon, extraction)
      case _ => Left(DecodingFailure("无效的任务目标", cursor.history))
    }
  }

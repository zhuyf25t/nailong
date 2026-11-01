package services.worlds.objects

import io.circe.{Decoder, Encoder}

enum ToolKind(val wireValue: String):
  case None extends ToolKind("none")
  case Curtain extends ToolKind("curtain")
  case Decoy extends ToolKind("decoy")
  case Pulse extends ToolKind("pulse")

object ToolKind:
  given Encoder[ToolKind] = Encoder.encodeString.contramap(_.wireValue)
  given Decoder[ToolKind] = Decoder.decodeString.emap(value => values.find(_.wireValue == value).toRight("无效的工具类型"))

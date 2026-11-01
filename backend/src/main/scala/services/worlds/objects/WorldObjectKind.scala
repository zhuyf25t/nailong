package services.worlds.objects

import io.circe.{Decoder, Encoder}

enum WorldObjectKind(val wireValue: String):
  case Crate extends WorldObjectKind("crate")
  case Barrel extends WorldObjectKind("barrel")
  case Wall extends WorldObjectKind("wall")
  case Gate extends WorldObjectKind("gate")

object WorldObjectKind:
  given Encoder[WorldObjectKind] = Encoder.encodeString.contramap(_.wireValue)
  given Decoder[WorldObjectKind] = Decoder.decodeString.emap(value => values.find(_.wireValue == value).toRight("无效的地图实体类型"))

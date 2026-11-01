package services.worlds.objects

import io.circe.{Decoder, Encoder}

final case class MissionId(value: String)
object MissionId:
  def valid(value: String): Boolean = value.length <= 48 && value.matches("[a-z][a-z0-9]*(?:-[a-z0-9]+)*")
  given Encoder[MissionId] = Encoder.encodeString.contramap(_.value)
  given Decoder[MissionId] = Decoder.decodeString.emap(value => Either.cond(valid(value), MissionId(value), "任务 ID 必须是有界小写 slug"))

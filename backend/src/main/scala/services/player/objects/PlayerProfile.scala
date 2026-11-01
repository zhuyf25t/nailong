package services.player.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.system.objects.TimeCodecs.given
import java.time.Instant

final case class PlayerProfile(id: PlayerId, username: String, nickname: String, createdAt: Instant)

object PlayerProfile:
  given Encoder[PlayerProfile] = deriveEncoder[PlayerProfile]
  given Decoder[PlayerProfile] = deriveDecoder[PlayerProfile]

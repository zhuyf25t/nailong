package services.player.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.player.objects.{PlayerProfile, SessionToken}
import services.system.objects.TimeCodecs.given
import java.time.Instant

final case class AuthResponse(player: PlayerProfile, userToken: SessionToken, expiresAt: Instant)

object AuthResponse:
  given Encoder[AuthResponse] = deriveEncoder[AuthResponse]
  given Decoder[AuthResponse] = deriveDecoder[AuthResponse]

package services.player.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class AuthenticatedPlayer(playerId: PlayerId, sessionId: SessionId)

object AuthenticatedPlayer:
  given Encoder[AuthenticatedPlayer] = deriveEncoder[AuthenticatedPlayer]
  given Decoder[AuthenticatedPlayer] = deriveDecoder[AuthenticatedPlayer]

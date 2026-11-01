package services.user.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.user.objects.TimeCodecs.given

import java.time.Instant

final case class UserProfile(
  id: UserId,
  username: String,
  role: UserRole,
  createdAt: Instant
)

object UserProfile:
  given Encoder[UserProfile] = deriveEncoder[UserProfile]
  given Decoder[UserProfile] = deriveDecoder[UserProfile]

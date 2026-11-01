package services.user.objects

import io.circe.{Decoder, Encoder}

enum UserRole:
  case Admin
  case Reader

object UserRole:

  def toString(role: UserRole): String =
    role match
      case UserRole.Admin => "admin"
      case UserRole.Reader => "reader"

  def fromString(value: String): Either[String, UserRole] =
    value.trim.toLowerCase match
      case "admin" => Right(UserRole.Admin)
      case "reader" => Right(UserRole.Reader)
      case other => Left(s"Unsupported UserRole value: $other")

  given Encoder[UserRole] = Encoder.encodeString.contramap(toString)
  given Decoder[UserRole] = Decoder.decodeString.emap(fromString)

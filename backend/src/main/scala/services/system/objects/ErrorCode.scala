package services.system.objects

import io.circe.{Decoder, Encoder}

enum ErrorCode:
  case ValidationError, Unauthorized, Forbidden, NotFound, Conflict, InternalError

object ErrorCode:
  def toString(value: ErrorCode): String = value match
    case ErrorCode.ValidationError => "validation_error"
    case ErrorCode.Unauthorized => "unauthorized"
    case ErrorCode.Forbidden => "forbidden"
    case ErrorCode.NotFound => "not_found"
    case ErrorCode.Conflict => "conflict"
    case ErrorCode.InternalError => "internal_error"
  def fromString(value: String): Either[String, ErrorCode] =
    ErrorCode.values.find(toString(_) == value).toRight("未知错误码")
  given Encoder[ErrorCode] = Encoder.encodeString.contramap(toString)
  given Decoder[ErrorCode] = Decoder.decodeString.emap(fromString)

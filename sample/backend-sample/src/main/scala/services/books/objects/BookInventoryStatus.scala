package services.books.objects

import io.circe.{Decoder, Encoder}

enum BookInventoryStatus:
  case Available
  case Borrowed

object BookInventoryStatus:

  def toString(status: BookInventoryStatus): String =
    status match
      case BookInventoryStatus.Available => "available"
      case BookInventoryStatus.Borrowed => "borrowed"

  def fromString(value: String): Either[String, BookInventoryStatus] =
    value.trim.toLowerCase match
      case "available" => Right(BookInventoryStatus.Available)
      case "borrowed" => Right(BookInventoryStatus.Borrowed)
      case other => Left(s"Unsupported BookInventoryStatus value: $other")

  given Encoder[BookInventoryStatus] = Encoder.encodeString.contramap(toString)
  given Decoder[BookInventoryStatus] = Decoder.decodeString.emap(fromString)

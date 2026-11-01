package services.books.objects

import io.circe.{Decoder, Encoder}

enum BorrowRecordStatus:
  case Borrowing
  case Overdue
  case Returned

object BorrowRecordStatus:

  def toString(status: BorrowRecordStatus): String =
    status match
      case BorrowRecordStatus.Borrowing => "borrowing"
      case BorrowRecordStatus.Overdue => "overdue"
      case BorrowRecordStatus.Returned => "returned"

  def fromString(value: String): Either[String, BorrowRecordStatus] =
    value.trim.toLowerCase match
      case "borrowing" => Right(BorrowRecordStatus.Borrowing)
      case "overdue" => Right(BorrowRecordStatus.Overdue)
      case "returned" => Right(BorrowRecordStatus.Returned)
      case other => Left(s"Unsupported BorrowRecordStatus value: $other")

  given Encoder[BorrowRecordStatus] = Encoder.encodeString.contramap(toString)
  given Decoder[BorrowRecordStatus] = Decoder.decodeString.emap(fromString)

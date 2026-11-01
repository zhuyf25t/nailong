package services.books.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class DeleteBookResponse(ok: Boolean)

object DeleteBookResponse:
  given Encoder[DeleteBookResponse] = deriveEncoder[DeleteBookResponse]
  given Decoder[DeleteBookResponse] = deriveDecoder[DeleteBookResponse]

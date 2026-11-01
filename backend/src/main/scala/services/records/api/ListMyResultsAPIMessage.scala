package services.records.api

import cats.effect.IO
import io.circe.{Decoder, DecodingFailure}
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.PlayerId
import services.records.objects.apiTypes.ResultListResponse
import services.records.tables.trainingresult.TrainingResultTable
import services.records.utils.ResultValidation
import services.system.api.APIWithTokenMessage
import java.sql.Connection

final case class ListMyResultsAPIMessage(playerId: PlayerId, offset: Int, limit: Int)
  extends APIWithTokenMessage[ResultListResponse]:
  override def plan(connection: Connection): IO[ResultListResponse] =
    for
      _ <- ResultValidation.validatePagination(offset, limit)
      items <- TrainingResultTable.listOwned(connection, playerId, offset, limit)
      total <- TrainingResultTable.countOwned(connection, playerId)
    yield ResultListResponse(items, total, offset, limit)

object ListMyResultsAPIMessage:
  private given Decoder[Int] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toInt)
      .toRight(DecodingFailure("分页参数必须为 JSON 整数", cursor.history))
  }
  given Decoder[ListMyResultsAPIMessage] = deriveDecoder[ListMyResultsAPIMessage]

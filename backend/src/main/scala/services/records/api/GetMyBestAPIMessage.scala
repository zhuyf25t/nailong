package services.records.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import services.player.objects.PlayerId
import services.records.objects.apiTypes.PersonalBestResponse
import services.records.tables.trainingresult.TrainingResultTable
import services.records.utils.ResultValidation
import services.system.api.APIWithTokenMessage
import services.training.objects.{TerrainConfig, TrainingConfigId}
import java.sql.Connection

final case class GetMyBestAPIMessage(
  playerId: PlayerId,
  configId: TrainingConfigId,
  configVersion: String,
  terrain: TerrainConfig
) extends APIWithTokenMessage[PersonalBestResponse]:
  override def plan(connection: Connection): IO[PersonalBestResponse] =
    for
      _ <- ResultValidation.validateBestFilter(configVersion, terrain)
      best <- TrainingResultTable.findBestOwned(connection, playerId, configId, configVersion, terrain)
    yield PersonalBestResponse(best)

object GetMyBestAPIMessage:
  given Decoder[GetMyBestAPIMessage] = deriveDecoder[GetMyBestAPIMessage]

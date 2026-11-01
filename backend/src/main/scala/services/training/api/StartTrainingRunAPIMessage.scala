package services.training.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import java.util.UUID
import scala.util.Try
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.{TerrainConfig, TrainingConfigId, TrainingRun}
import services.training.tables.trainingconfig.TrainingConfigTable
import services.training.tables.trainingrun.TrainingRunTable
import services.training.utils.ValidateTerrain

/** playerId is injected by the authenticated router, never trusted from browser JSON. */
final case class StartTrainingRunAPIMessage(
  playerId: PlayerId,
  requestId: UUID,
  configId: TrainingConfigId,
  configVersion: String,
  terrain: TerrainConfig
) extends APIWithTokenMessage[TrainingRun]:
  override def plan(connection: Connection): IO[TrainingRun] =
    for
      _ <- ValidateTerrain(terrain)
      _ <- IO.raiseWhen(configVersion.isEmpty || configVersion.length > 128)(HttpError.validation("配置版本格式错误。"))
      previous <- TrainingRunTable.findByRequest(connection, playerId, requestId)
      run <- previous match
        case Some(existing) => sameRequest(existing)
        case None =>
          for
            current <- TrainingConfigTable.current(connection)
            _ <- IO.raiseWhen(current.id != configId || current.version != configVersion)(
              HttpError.conflict("训练规则已更新，请重新准备本局。")
            )
            inserted <- TrainingRunTable.insertIfAbsent(connection, playerId, requestId, current, terrain)
            winner <- inserted match
              case Some(created) => IO.pure(created)
              case None => TrainingRunTable.findByRequest(connection, playerId, requestId)
                .flatMap(found => IO.fromOption(found)(new IllegalStateException("Conflicting run insert is missing")))
            checked <- sameRequest(winner)
          yield checked
    yield run

  private def sameRequest(run: TrainingRun): IO[TrainingRun] =
    if run.config.id == configId && run.config.version == configVersion && run.terrain == terrain then IO.pure(run)
    else IO.raiseError(HttpError.conflict("此开局请求已被使用，且请求内容不同。请使用新的 requestId。"))

object StartTrainingRunAPIMessage:
  private given Decoder[UUID] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "requestId 必须是 UUID")
      .flatMap(uuid => Either.cond(uuid.toString == value, uuid, "requestId 必须是规范小写 UUID"))
  }
  given Decoder[StartTrainingRunAPIMessage] = deriveDecoder[StartTrainingRunAPIMessage]

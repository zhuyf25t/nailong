package services.training.api

import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import java.util.UUID
import java.util.concurrent.ThreadLocalRandom
import scala.util.Try
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.training.objects.{DroneSpawn, RunSelection, RunSetup, TerrainConfig, TrainingConfig, TrainingConfigId, TrainingRun}
import services.training.tables.trainingconfig.TrainingConfigTable
import services.training.tables.trainingrun.TrainingRunTable
import services.training.utils.{ValidateRunSelection, ValidateTerrain}
import services.worlds.api.{GetMapVersionAPIMessage, GetMissionAPIMessage}
import services.worlds.objects.MissionObjective

/** playerId is injected by the authenticated router, never trusted from browser JSON. */
final case class StartTrainingRunAPIMessage(
  playerId: PlayerId,
  requestId: UUID,
  configId: TrainingConfigId,
  configVersion: String,
  terrain: TerrainConfig,
  selection: Option[RunSelection] = None
) extends APIWithTokenMessage[TrainingRun]:
  override def plan(connection: Connection): IO[TrainingRun] =
    for
      _ <- ValidateTerrain(terrain)
      _ <- IO.raiseWhen(configVersion.isEmpty || configVersion.length > 128)(HttpError.validation("配置版本格式错误。"))
      previous <- TrainingRunTable.findByRequest(connection, playerId, requestId)
      run <- previous match
        case Some(existing) => sameRequest(connection, existing)
        case None =>
          for
            current <- TrainingConfigTable.current(connection)
            _ <- IO.raiseWhen(current.id != configId || current.version != configVersion)(
              HttpError.conflict("训练规则已更新，请重新准备本局。")
            )
            setup <- resolveSetup(connection, current)
            frozenConfig = setup.fold(current) { value =>
              current.copy(terrain = value.world.terrain, drones = current.drones.copy(
                spawns = value.world.drones.map(drone => DroneSpawn(drone.x, drone.z, drone.yaw))
              ))
            }
            inserted <- TrainingRunTable.insertIfAbsent(connection, playerId, requestId, frozenConfig, terrain, setup, selection)
            winner <- inserted match
              case Some(created) => IO.pure(created)
              case None => TrainingRunTable.findByRequest(connection, playerId, requestId)
                .flatMap(found => IO.fromOption(found)(new IllegalStateException("Conflicting run insert is missing")))
            checked <- sameRequest(connection, winner)
          yield checked
    yield run

  private def sameRequest(connection: Connection, run: TrainingRun): IO[TrainingRun] =
    for
      originalSelection <- TrainingRunTable.requestSelection(connection, playerId, requestId)
      _ <- IO.raiseUnless(run.config.id == configId && run.config.version == configVersion && run.terrain == terrain && originalSelection == selection)(
        HttpError.conflict("此开局请求已被使用，且请求内容不同。请使用新的 requestId。")
      )
    yield run

  private def resolveSetup(connection: Connection, current: TrainingConfig): IO[Option[RunSetup]] = selection match
    case None => IO.pure(None)
    case Some(chosen) =>
      for
        // Other service internals remain private: both public plans share this transaction connection.
        mission <- GetMissionAPIMessage(chosen.missionId).plan(connection)
        _ <- ValidateRunSelection(chosen, mission, current)
        version <- GetMapVersionAPIMessage(playerId, chosen.mapVersionId.getOrElse(mission.mapVersionId)).plan(connection)
        _ <- IO.raiseWhen(version.world.terrain != terrain)(HttpError.conflict("地形与选定地图版本不一致，请重新加载地图。"))
        objective = mission.objective match
          case MissionObjective.ClearDrones => MissionObjective.ClearDrones
          case MissionObjective.ActivateExtract(_, _) =>
            MissionObjective.ActivateExtract(version.world.beacon.id, version.world.extraction.id)
        resolvedMission = mission.copy(objective = objective, mapVersionId = version.id)
        seed <- IO(ThreadLocalRandom.current().nextLong(Int.MaxValue.toLong + 1))
      yield Some(RunSetup(resolvedMission, version.world, version.id, chosen.loadout, seed, "garden-v1"))

object StartTrainingRunAPIMessage:
  private given Decoder[UUID] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "requestId 必须是 UUID")
      .flatMap(uuid => Either.cond(uuid.toString == value, uuid, "requestId 必须是规范小写 UUID"))
  }
  given Decoder[StartTrainingRunAPIMessage] = deriveDecoder[StartTrainingRunAPIMessage]

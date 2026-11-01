package services.training.utils

import cats.effect.IO
import services.system.objects.HttpError
import services.training.objects.{RunSelection, TrainingConfig}
import services.worlds.objects.MissionDefinition

object ValidateRunSelection:
  private[training] def apply(selection: RunSelection, mission: MissionDefinition, config: TrainingConfig): IO[Unit] =
    for
      _ <- IO.raiseWhen(mission.configVersion != config.version)(HttpError.conflict("任务与当前规则版本不匹配，请重新选择任务。"))
      _ <- IO.raiseUnless(mission.allowedTools.contains(selection.loadout.tool))(HttpError.validation("此任务不允许携带所选工具。"))
    yield ()

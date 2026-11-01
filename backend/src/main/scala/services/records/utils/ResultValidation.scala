package services.records.utils

import cats.effect.IO
import services.records.objects.{ResultOutcome, ResultSubmission, TrainingResult}
import services.system.objects.HttpError
import services.training.objects.{TerrainConfig, TrainingRun}
import services.worlds.objects.MissionObjective

object ResultValidation:
  private[records] def validateSubmission(run: TrainingRun, submission: ResultSubmission): IO[Unit] = IO {
    val shots = submission.shotsFired.toLong
    val hits = submission.hits.toLong
    val destroyed = submission.destroyed.toLong
    val count = run.setup.fold(run.config.drones.spawns.length)(_.world.drones.length).toLong
    val hp = run.config.drones.maxHp.toLong
    if shots < 0 || shots > 1000000 || hits < 0 || destroyed < 0 then
      throw HttpError.validation("发射、命中与击毁数量必须为非负整数，发射数量不能超过一百万")
    if submission.elapsedMs < 0 || submission.elapsedMs > 86400000L then
      throw HttpError.validation("用时必须为 0 至 86400000 的整数毫秒")
    if hits > shots || destroyed > count then
      throw HttpError.validation("命中不能多于发射，击毁不能多于本局无人机总数")
    val minimumHits = destroyed * hp
    val maximumHits = minimumHits + (count - destroyed) * (hp - 1)
    if hits < minimumHits || hits > maximumHits then
      throw HttpError.validation("命中数与无人机血量、击毁数量不一致")
    run.setup.map(_.mission.objective).getOrElse(MissionObjective.ClearDrones) match
      case MissionObjective.ClearDrones =>
        submission.outcome match
          case ResultOutcome.Victory if destroyed != count || hits != count * hp =>
            throw HttpError.validation("胜利必须击毁本局所有无人机")
          case ResultOutcome.Defeat if destroyed == count =>
            throw HttpError.validation("无人机已全部击毁，不能记录为失败")
          case _ => ()
        if submission.objectiveProgress.exists(p => p.beaconActivated || p.extracted) then
          throw HttpError.validation("清场任务不能声明撤离目标进度")
      case MissionObjective.ActivateExtract(_, _) =>
        val progress = submission.objectiveProgress.getOrElse(throw HttpError.validation("撤离任务必须提供目标进度"))
        if progress.extracted && !progress.beaconActivated then
          throw HttpError.validation("激活信标后才能撤离")
        if submission.outcome == ResultOutcome.Victory && (!progress.beaconActivated || !progress.extracted) then
          throw HttpError.validation("撤离胜利必须激活信标并完成撤离")
        if submission.outcome == ResultOutcome.Defeat && progress.extracted then
          throw HttpError.validation("已成功撤离不能记录为失败")
    // The first shot is immediate; allow one further interval at the timing boundary.
    val minimumElapsed = math.max(0L, shots - 2L) * run.config.weapon.fireIntervalMs.toLong
    if submission.elapsedMs < minimumElapsed then
      throw HttpError.validation("发射数量超过该用时内武器能够发射的数量")
  }

  private[records] def sameSubmission(result: TrainingResult, submission: ResultSubmission): Boolean =
    result.outcome == submission.outcome &&
      result.shotsFired == submission.shotsFired &&
      result.hits == submission.hits &&
      result.destroyed == submission.destroyed &&
      result.elapsedMs == submission.elapsedMs &&
      result.objectiveProgress == submission.objectiveProgress

  private[records] def validatePagination(offset: Int, limit: Int): IO[Unit] = IO {
    if offset < 0 || offset > 10000 || limit < 1 || limit > 50 then
      throw HttpError.validation("offset 必须为 0–10000，limit 必须为 1–50")
  }

  private[records] def validateBestFilter(configVersion: String, terrain: TerrainConfig): IO[Unit] = IO {
    if configVersion.isEmpty || configVersion.length > 100 then
      throw HttpError.validation("配置版本不能为空且不能超过 100 字符")
    val valid =
      terrain.hillHeight.isFinite && terrain.hillHeight >= 0 && terrain.hillHeight <= 4 &&
      terrain.hillWidth.isFinite && terrain.hillWidth >= 2.5 && terrain.hillWidth <= 9 &&
      terrain.hillX.isFinite && terrain.hillX >= -8 && terrain.hillX <= 8 &&
      terrain.hillZ.isFinite && terrain.hillZ >= -8 && terrain.hillZ <= 8 &&
      terrain.ripple.isFinite && terrain.ripple >= 0 && terrain.ripple <= 0.8
    if !valid then throw HttpError.validation("地形参数不在允许范围内")
  }

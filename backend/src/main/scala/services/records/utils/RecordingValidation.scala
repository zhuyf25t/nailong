package services.records.utils

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import services.records.objects.*
import services.system.objects.HttpError
import services.training.objects.{Point3, TrainingRun}
import services.worlds.objects.WorldObjectKind

/** Validates uploaded pure data; replay never re-simulates or changes the saved result. */
object RecordingValidation:
  val maxReplayBytes = 6 * 1024 * 1024
  val maxSummaryBytes = 1024 * 1024
  private val eventKinds = Set("shot", "hit", "drone-state", "destroyed", "tool", "beacon", "gate", "extract", "contact", "round-end")
  private def requireValid(value: Boolean, message: String): Unit =
    if !value then throw HttpError.validation(message)
  private def bounded(value: Double, limit: Double): Boolean = value.isFinite && math.abs(value) <= limit
  private def point(value: Point3): Boolean = bounded(value.x, 1000) && bounded(value.y, 1000) && bounded(value.z, 1000)
  private def validId(value: String): Boolean = value.nonEmpty && value.length <= 80 && value.matches("[a-zA-Z0-9_-]+")
  def hash(text: String): String = MessageDigest.getInstance("SHA-256").digest(text.getBytes(UTF_8)).map(b => f"${b & 0xff}%02x").mkString
  def summaryHash(summary: RunEventSummary): String = hash(summary.asJson.noSpaces)

  /** The caller holds the same run lock for both independent upload APIs. */
  def validateConsistency(summary: RunEventSummary, replay: ReplayPayload): IO[Unit] = IO {
    val summaryBySeq = summary.events.map(event => event.seq -> event).toMap
    val replayBySeq = replay.events.map(event => event.seq -> event).toMap
    val overlapMatches = summaryBySeq.forall { (seq, event) => replayBySeq.get(seq).forall(_ == event) }
    val summaryCoversReplay = summary.truncated || replayBySeq.keySet.subsetOf(summaryBySeq.keySet)
    val replayCoversSummary = replay.manifest.coverage.kind != "complete" || summaryBySeq.keySet.subsetOf(replayBySeq.keySet)
    if !overlapMatches || !summaryCoversReplay || !replayCoversSummary then
      throw HttpError.conflict("事件摘要与录像的同序号事件不一致，或完整记录遗漏了另一份记录中的事件")
  }

  def validateStoredReplayConsistency(summary: RunEventSummary, stored: StoredRunReplay): IO[Unit] =
    for
      _ <- IO.raiseWhen(stored.formatVersion != 1)(HttpError.conflict("已有录像格式不受支持，不能校验新的事件摘要"))
      replay <- IO.fromEither(decode[ReplayPayload](stored.replay.payloadJson).left.map(error =>
        new IllegalStateException("已保存录像无法解码", error)))
      _ <- validateConsistency(summary, replay)
    yield ()

  def validateSummary(run: TrainingRun, result: TrainingResult, summary: RunEventSummary): IO[Unit] = IO {
    requireValid(summary.formatVersion == 1, "不支持的事件格式版本")
    requireValid(summary.asJson.noSpaces.getBytes(UTF_8).length <= maxSummaryBytes, "事件摘要超过 1 MiB")
    timing(summary.resultAtMs, summary.runDurationMs, result)
    events(run, result, summary.events, summary.truncated, 0L, summary.runDurationMs, Set.empty)
  }

  def validateReplay(run: TrainingRun, result: TrainingResult, envelope: ReplayEnvelope): IO[ReplayPayload] = IO {
    requireValid(envelope.payloadJson.getBytes(UTF_8).length <= maxReplayBytes, "回放内容超过 6 MiB")
    requireValid(envelope.contentHash.matches("[0-9a-f]{64}") && hash(envelope.payloadJson) == envelope.contentHash, "回放内容哈希不匹配")
    val payload = decode[ReplayPayload](envelope.payloadJson).fold(_ => throw HttpError.validation("回放字段缺失或类型不正确"), identity)
    val manifest = payload.manifest
    val setup = run.setup.getOrElse(throw HttpError.conflict("旧版局次不能上传录像"))
    requireValid(manifest.formatVersion == 1 && manifest.sampleHz == 10, "不支持的回放格式或采样率")
    requireValid(manifest.runId.contains(run.id), "录像局次不匹配")
    requireValid(manifest.config == run.config && manifest.world == setup.world, "录像必须使用本局冻结的规则与世界")
    requireValid(manifest.mapVersionId.contains(setup.mapVersionId) && manifest.missionId == setup.mission.id.value && manifest.assetVersion == setup.assetVersion && manifest.assetVersion == "garden-v1", "录像的地图、任务或素材版本不匹配")
    val coverage = manifest.coverage
    timing(coverage.resultAtMs, coverage.runDurationMs, result)
    requireValid(coverage.fromMs >= 0 && coverage.fromMs <= coverage.resultAtMs && coverage.toMs == coverage.runDurationMs, "回放覆盖区间无效")
    requireValid((coverage.kind == "complete" && coverage.fromMs == 0 && coverage.reason.isEmpty) ||
      (coverage.kind == "ending-clip" && coverage.reason.exists(Set("byte-limit", "duration-limit", "frame-limit"))), "回放必须如实标记完整录像或尾段")
    requireValid(payload.frames.nonEmpty && payload.frames.length <= 12000, "回放帧数必须为 1 至 12000")
    requireValid(payload.frames.head.tMs == coverage.fromMs && payload.frames.last.tMs == coverage.toMs, "回放首尾帧与覆盖区间不一致")
    events(run, result, payload.events, coverage.kind == "ending-clip", coverage.fromMs, coverage.toMs, payload.frames.head.projectiles.map(_.id).toSet)
    frames(run, result, payload)
    payload
  }

  private def timing(resultAtMs: Long, duration: Long, result: TrainingResult): Unit =
    requireValid(resultAtMs == result.elapsedMs && duration >= resultAtMs && duration <= resultAtMs + 1200 && duration <= 86401200L, "录像计分时刻或结束尾段与成绩不一致")

  private def events(run: TrainingRun, result: TrainingResult, values: List[RunEvent], truncated: Boolean, from: Long, to: Long, initialProjectiles: Set[String]): Unit =
    requireValid(values.nonEmpty && values.length <= 10000, "事件数量必须为 1 至 10000")
    val setup = run.setup.getOrElse(throw HttpError.conflict("旧版局次不能上传事件"))
    val world = setup.world
    val drones = world.drones.map(_.id).toSet
    val gates = world.objects.filter(_.kind == WorldObjectKind.Gate).map(_.id).toSet
    var previousSeq = -1
    var previousTime = -1L
    var projectiles = initialProjectiles
    var dynamicIds = Set.empty[String]
    var destroyed = Set.empty[String]
    values.foreach { event =>
      requireValid(event.seq >= 0 && event.seq <= 10000000 && event.seq > previousSeq && event.tMs >= previousTime && event.tMs >= from && event.tMs <= to, "事件序号必须递增且不超过一千万，时间必须单调且位于录像内")
      requireValid(eventKinds(event.kind), "未知事件类型")
      requireValid((event.actorId.toList ++ event.targetId.toList).forall(validId), "事件实体 ID 无效")
      requireValid(event.position.forall(point) && event.value.forall(bounded(_, 1000000)) && event.detail.forall(_.length <= 100), "事件数值或描述超过限制")
      def targetIn(ids: Set[String]): Unit = requireValid(event.targetId.exists(ids), "事件引用了不存在的目标")
      def actorIn(ids: Set[String]): Unit = requireValid(event.actorId.exists(ids), "事件引用了不存在的实体")
      event.kind match
        case "shot" =>
          actorIn(Set("player")); requireValid(event.targetId.exists(id => validId(id) && !dynamicIds(id) && !drones(id)), "弹丸实例 ID 必须唯一")
          projectiles ++= event.targetId; dynamicIds ++= event.targetId
        case "hit" =>
          targetIn(drones)
          requireValid(event.actorId.exists(id => if truncated then validId(id) else projectiles(id)), "命中事件未引用已发射弹丸")
        case "drone-state" =>
          actorIn(drones)
          requireValid(event.detail.exists(Set("locked:saw-player", "alert:hit-unaware", "alert:lost-sight", "scanning:search-ended")), "无人机状态事件无效")
        case "destroyed" => targetIn(drones); requireValid(!destroyed(event.targetId.get), "无人机重复击毁"); destroyed ++= event.targetId
        case "contact" => actorIn(drones); targetIn(Set("player"))
        case "gate" => targetIn(gates)
        case "beacon" => targetIn(Set(world.beacon.id))
        case "extract" => targetIn(Set(world.extraction.id))
        case "tool" =>
          actorIn(Set("player")); requireValid(event.targetId.exists(id => validId(id) && !dynamicIds(id)), "工具实例 ID 必须唯一")
          requireValid(event.detail.exists(Set("curtain", "decoy", "pulse")), "未知工具事件")
          requireValid(event.detail.contains(setup.loadout.tool.wireValue), "事件工具不是本局装备")
          dynamicIds ++= event.targetId
        case "round-end" => requireValid(event.detail.contains(ResultOutcome.toString(result.outcome)) && event.tMs == result.elapsedMs, "终局事件与成绩不一致")
        case _ => ()
      previousSeq = event.seq; previousTime = event.tMs
    }
    requireValid(values.count(_.kind == "round-end") == 1 && values.last.kind == "round-end", "事件必须恰好以一个终局结束")
    requireValid(values.count(_.kind == "tool") <= 1, "每局工具只能使用一次")
    val contacts = values.filter(_.kind == "contact")
    requireValid(contacts.size <= 1 && (contacts.isEmpty || result.outcome == ResultOutcome.Defeat), "接触自爆只发生一次且应导致失败")
    requireValid(!contacts.flatMap(_.actorId).exists(destroyed), "已被击毁的无人机不能再次接触自爆")
    if !truncated then
      requireValid(values.head.seq == 0, "完整事件必须从序号 0 开始")
      requireValid(values.count(_.kind == "shot") == result.shotsFired && values.count(_.kind == "hit") == result.hits && values.count(_.kind == "destroyed") == result.destroyed, "完整事件计数与成绩不一致")
      val progress = result.objectiveProgress
      requireValid(values.exists(_.kind == "beacon") == progress.exists(_.beaconActivated) && values.exists(_.kind == "extract") == progress.exists(_.extracted), "目标事件与成绩不一致")

  private def frames(run: TrainingRun, result: TrainingResult, payload: ReplayPayload): Unit =
    val world = run.setup.get.world
    val droneIds = world.drones.map(_.id).toSet
    val gates = world.objects.filter(_.kind == WorldObjectKind.Gate).map(_.id).toSet
    val initialProjectiles = if payload.manifest.coverage.kind == "ending-clip" then payload.frames.head.projectiles.map(p => p.id -> (payload.frames.head.tMs, -1)).toMap else Map.empty[String, (Long, Int)]
    val initialTools = if payload.manifest.coverage.kind == "ending-clip" then payload.frames.head.tools.map(t => t.id -> (payload.frames.head.tMs, -1)).toMap else Map.empty[String, (Long, Int)]
    val knownProjectiles = initialProjectiles ++ payload.events.filter(_.kind == "shot").flatMap(e => e.targetId.map(_ -> (e.tMs, e.seq))).toMap
    val knownTools = initialTools ++ payload.events.filter(_.kind == "tool").flatMap(e => e.targetId.map(_ -> (e.tMs, e.seq))).toMap
    val eventVector = payload.events.toVector
    val bySeq = payload.events.map(event => event.seq -> event).toMap
    val firstSeq = payload.events.head.seq
    val lastSeq = payload.events.last.seq
    var previous: Option[ReplayFrame] = None
    var eventIndex = 0
    var mandatorySeq = -1
    payload.frames.foreach { frame =>
      requireValid(frame.tMs >= 0 && frame.scoreElapsedMs >= 0 && frame.scoreElapsedMs <= result.elapsedMs && frame.scoreElapsedMs <= frame.tMs, "帧时间无效")
      requireValid(frame.throughEventSeq >= -1 && frame.throughEventSeq <= lastSeq, "帧引用了未知事件序号")
      if frame.throughEventSeq >= firstSeq then requireValid(bySeq.get(frame.throughEventSeq).exists(_.tMs <= frame.tMs), "帧不能提前应用未来事件")
      while eventIndex < eventVector.length && eventVector(eventIndex).tMs < frame.tMs do
        mandatorySeq = eventVector(eventIndex).seq; eventIndex += 1
      requireValid(frame.throughEventSeq >= mandatorySeq, "帧遗漏了已发生事件")
      previous.foreach { old =>
        requireValid(frame.tMs > old.tMs && frame.scoreElapsedMs >= old.scoreElapsedMs && frame.throughEventSeq >= old.throughEventSeq, "帧时间和事件进度必须单调")
        requireValid(!old.world.beaconActivated || frame.world.beaconActivated, "信标状态不能回退")
        requireValid(!old.world.extracted || frame.world.extracted, "撤离状态不能回退")
        requireValid(old.world.openGateIds.forall(frame.world.openGateIds.contains), "已开启的门不能在录像中关闭")
        val oldHp = old.drones.map(d => d.id -> d.hp).toMap
        requireValid(frame.drones.forall(d => oldHp.get(d.id).forall(_ >= d.hp)), "无人机血量不能增加")
      }
      val player = frame.player
      requireValid(point(player.position) && bounded(player.yaw, 1000000) && Set("idle", "walk", "jump", "aim")(player.animation) && player.animationTime >= 0 && bounded(player.animationTime, 1000000) && player.aimWeight >= 0 && player.aimWeight <= 1, "角色帧无效")
      requireValid(frame.drones.length <= 32 && frame.drones.map(_.id).toSet == droneIds && frame.drones.map(_.id).distinct.size == frame.drones.size, "每帧必须恰好包含本局全部无人机")
      frame.drones.foreach(d => requireValid(point(d.position) && bounded(d.yaw, 1000000) && d.hp >= 0 && d.hp <= run.config.drones.maxHp && Set("scanning", "alert", "locked", "destroyed")(d.state) && ((d.hp == 0) == (d.state == "destroyed")) && Set("taking-off", "cruising", "diving")(d.flight), "无人机帧无效"))
      requireValid(frame.projectiles.length <= 64 && frame.tools.length <= 16, "活动弹丸或工具数量过多")
      val dynamicIds = frame.projectiles.map(_.id) ++ frame.tools.map(_.id)
      requireValid(dynamicIds.forall(validId) && dynamicIds.distinct.size == dynamicIds.size && !dynamicIds.exists(droneIds), "活动实体 ID 重复或无效")
      def declared(declarations: Map[String, (Long, Int)], id: String): Boolean = declarations.get(id).exists { (time, seq) => time <= frame.tMs && seq <= frame.throughEventSeq }
      requireValid(frame.projectiles.forall(p => declared(knownProjectiles, p.id)) && frame.tools.forall(t => declared(knownTools, t.id)), "帧引用未声明或尚未发生的弹丸或工具实例")
      frame.projectiles.foreach(p => requireValid(point(p.position) && point(p.direction) && math.abs(p.direction.x * p.direction.x + p.direction.y * p.direction.y + p.direction.z * p.direction.z - 1) < 0.01, "弹丸帧无效"))
      frame.tools.foreach(t => requireValid(Set("curtain", "decoy", "pulse")(t.kind) && t.kind == run.setup.get.loadout.tool.wireValue && point(t.position) && t.radius > 0 && t.radius <= 100 && t.remainingMs >= 0 && t.remainingMs <= 86400000, "工具帧无效"))
      requireValid(frame.world.openGateIds.distinct.size == frame.world.openGateIds.size && frame.world.openGateIds.forall(gates) && (!frame.world.extracted || frame.world.beaconActivated), "世界交互帧无效")
      requireValid(point(frame.camera.position) && point(frame.camera.target) && frame.camera.fov >= 10 && frame.camera.fov <= 120, "镜头帧无效")
      previous = Some(frame)
    }
    val end = payload.frames.last
    requireValid(end.scoreElapsedMs == result.elapsedMs && end.throughEventSeq == lastSeq, "末帧必须包含最终计分及终局事件")
    val contactIds = payload.events.filter(_.kind == "contact").flatMap(_.actorId).toSet
    requireValid(end.drones.count(_.state == "destroyed") == result.destroyed + contactIds.size && end.drones.filter(d => contactIds(d.id)).forall(_.hp == 0), "末帧击毁数与成绩不一致（接触自爆不计击毁）")
    requireValid(end.world.beaconActivated == result.objectiveProgress.exists(_.beaconActivated) && end.world.extracted == result.objectiveProgress.exists(_.extracted), "末帧任务进度与成绩不一致")
    requireValid(end.player.alive == (result.outcome == ResultOutcome.Victory), "末帧角色存活状态与成绩不一致")

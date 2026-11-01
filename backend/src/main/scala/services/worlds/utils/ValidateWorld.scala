package services.worlds.utils

import cats.effect.IO
import scala.collection.mutable
import services.system.objects.HttpError
import services.worlds.objects.*

/** Independent server validation; no browser verdict is accepted as evidence of a safe map. */
object ValidateWorld:
  private val PlayerRadius = 0.55
  private val DroneRadius = 0.65
  private val AnchorDistance = 1.5
  private val StableId = "^[a-z][a-z0-9-]{0,63}$".r

  private[worlds] def apply(world: WorldDefinition): IO[Unit] = IO.defer {
    issues(world).headOption match
      case Some(issue) => IO.raiseError(HttpError.validation(issue.message))
      case None => IO.unit
  }

  private[worlds] def issues(world: WorldDefinition): List[MapValidationIssue] =
    val found = mutable.ListBuffer.empty[MapValidationIssue]
    def add(code: String, message: String, id: Option[String] = None): Unit =
      found += MapValidationIssue(code, message, id)
    def between(value: Double, min: Double, max: Double): Boolean =
      value.isFinite && value >= min && value <= max
    def finite(values: Double*): Boolean = values.forall(_.isFinite)
    def inside(x: Double, z: Double, radius: Double = 0): Boolean =
      finite(x, z) && math.abs(x) + radius <= world.bounds.halfSize && math.abs(z) + radius <= world.bounds.halfSize

    if world.schemaVersion != 1 then add("schema_invalid", "不支持此地图格式，请使用版本 1。")
    if world.title.trim.isEmpty || world.title.length > 80 then add("invalid_title", "地图名称需要 1 到 80 个字符。")
    if !between(world.bounds.halfSize, 12, 48) then add("bounds_invalid", "地图半边长必须在 12 到 48 米之间。")
    if world.objects.size > 48 then add("object_budget", "地图最多允许 48 个实体。")
    if world.drones.isEmpty || world.drones.size > 8 then add("drone_budget", "地图需要 1 到 8 架无人机。")

    val terrain = world.terrain
    if !between(terrain.hillHeight, 0, 4) || !between(terrain.hillWidth, 2.5, 9) ||
        !between(terrain.hillX, -8, 8) || !between(terrain.hillZ, -8, 8) || !between(terrain.ripple, 0, 0.8) then
      add("invalid_terrain", "地形参数超出允许范围。")

    val ids = world.objects.map(_.id) ++ world.drones.map(_.id) ++ List(world.beacon.id, world.extraction.id)
    val seen = mutable.HashSet.empty[String]
    ids.foreach { id =>
      if !StableId.matches(id) then add("invalid_id", "实体 ID 必须是以字母开头的 1 到 64 位小写字母、数字或连字符。", Some(id))
      if id == "player" || id.startsWith("projectile-") || id.startsWith("tool-") then
        add("reserved_id", "实体 ID 不能使用 player、projectile- 或 tool- 运行时保留名称。", Some(id))
      if !seen.add(id) then add("duplicate_id", "地图中的实体、无人机和目标 ID 必须全局唯一。", Some(id))
    }
    if !inside(world.spawn.x, world.spawn.z, PlayerRadius) then add("out_of_bounds", "出生点及角色半径必须位于地图内。")
    if !between(world.spawn.yaw, -1000000, 1000000) then add("invalid_rotation", "出生朝向必须是绝对值不超过 1000000 的有限数值。", Some("spawn"))

    world.objects.foreach { entity =>
      if !between(entity.width, 0.5, 16) || !between(entity.depth, 0.5, 16) || !between(entity.height, 0.5, 8) then
        add("invalid_size", "实体宽深必须在 0.5 到 16 米、高度在 0.5 到 8 米之间。", Some(entity.id))
      if !finite(entity.x, entity.z) || math.abs(entity.x) + entity.width / 2 > world.bounds.halfSize ||
          math.abs(entity.z) + entity.depth / 2 > world.bounds.halfSize then
        add("out_of_bounds", "实体的整个底面必须位于地图内。", Some(entity.id))
    }
    world.drones.foreach { drone =>
      if !inside(drone.x, drone.z, DroneRadius) then add("out_of_bounds", "无人机及其半径必须位于地图内。", Some(drone.id))
      if !between(drone.yaw, -1000000, 1000000) then add("invalid_rotation", "无人机朝向必须是绝对值不超过 1000000 的有限数值。", Some(drone.id))
      if drone.patrol.size > 12 then add("patrol_budget", "每架无人机最多允许 12 个巡逻点。", Some(drone.id))
      drone.patrol.foreach { point =>
        if !inside(point.x, point.z, DroneRadius) then add("out_of_bounds", "巡逻点及无人机半径必须位于地图内。", Some(drone.id))
      }
    }
    val markers = List(world.beacon, world.extraction)
    markers.foreach { marker =>
      if !between(marker.radius, 0.6, 4) then add("invalid_size", "目标范围半径必须在 0.6 到 4 米之间。", Some(marker.id))
      if !inside(marker.x, marker.z, marker.radius) then add("out_of_bounds", "目标的整个范围必须位于地图内。", Some(marker.id))
    }

    // Invalid values or budgets never reach the bounded geometric search.
    if found.nonEmpty then return found.toList

    world.objects.zipWithIndex.foreach { (entity, index) =>
      world.objects.take(index).foreach { other =>
        if entity.x - entity.width / 2 < other.x + other.width / 2 &&
            entity.x + entity.width / 2 > other.x - other.width / 2 &&
            entity.z - entity.depth / 2 < other.z + other.depth / 2 &&
            entity.z + entity.depth / 2 > other.z - other.depth / 2 then
          add("entity_overlap", s"实体与 ${other.id} 重叠。", Some(entity.id))
      }
    }
    def blocked(x: Double, z: Double, radius: Double): Boolean =
      world.objects.exists { entity =>
        val dx = x - math.max(entity.x - entity.width / 2, math.min(entity.x + entity.width / 2, x))
        val dz = z - math.max(entity.z - entity.depth / 2, math.min(entity.z + entity.depth / 2, z))
        math.hypot(dx, dz) < radius
      }
    if blocked(world.spawn.x, world.spawn.z, PlayerRadius) then add("blocked_spawn", "出生点与实体重叠，请留出角色空间。")
    world.drones.foreach { drone =>
      if blocked(drone.x, drone.z, DroneRadius) then add("blocked_drone", "无人机与实体重叠。", Some(drone.id))
      if drone.patrol.exists(point => blocked(point.x, point.z, DroneRadius)) then
        add("blocked_patrol", "巡逻点与实体重叠。", Some(drone.id))
    }
    markers.foreach { marker =>
      if blocked(marker.x, marker.z, marker.radius) then add("blocked_marker", "目标范围与实体重叠。", Some(marker.id))
    }
    if math.hypot(world.spawn.x - world.beacon.x, world.spawn.z - world.beacon.z) < world.beacon.radius + PlayerRadius then
      add("entity_overlap", "出生点不能与信标交互区域重叠。", Some("spawn"))
    if math.hypot(world.beacon.x - world.extraction.x, world.beacon.z - world.extraction.z) < world.beacon.radius + world.extraction.radius then
      add("entity_overlap", "信标与撤离区域不能重叠。", Some(world.extraction.id))
    if found.nonEmpty then return found.toList

    if !canReach(world, world.spawn.x, world.spawn.z, world.beacon, gatesOpen = false) then
      add("unreachable_beacon", "关闭门时出生点无法到达信标，请保留可通过的路线。", Some(world.beacon.id))
    if !canReach(world, world.beacon.x, world.beacon.z, world.extraction, gatesOpen = true) then
      add("unreachable_extraction", "激活信标后无法到达撤离点，请保留可通过的路线。", Some(world.extraction.id))
    found.toList

  /** A conservative 1 m check; only the post-beacon phase may traverse open gates. */
  private def canReach(world: WorldDefinition, startX: Double, startZ: Double, target: WorldMarker, gatesOpen: Boolean): Boolean =
    val obstacles = world.objects.filterNot(entity => gatesOpen && entity.kind == WorldObjectKind.Gate)
    val low = math.ceil(-world.bounds.halfSize + PlayerRadius).toInt
    val high = math.floor(world.bounds.halfSize - PlayerRadius).toInt
    val side = high - low + 1
    def x(index: Int): Double = low + index % side
    def z(index: Int): Double = low + index / side
    def segmentBlocked(ax: Double, az: Double, bx: Double, bz: Double): Boolean =
      obstacles.exists { entity =>
        var tMin = 0.0
        var tMax = 1.0
        def clip(start: Double, delta: Double, min: Double, max: Double): Boolean =
          if math.abs(delta) < 1e-10 then start >= min && start <= max
          else
            val first = (min - start) / delta
            val last = (max - start) / delta
            tMin = math.max(tMin, math.min(first, last))
            tMax = math.min(tMax, math.max(first, last))
            tMin <= tMax
        clip(ax, bx - ax, entity.x - entity.width / 2 - PlayerRadius, entity.x + entity.width / 2 + PlayerRadius) &&
          clip(az, bz - az, entity.z - entity.depth / 2 - PlayerRadius, entity.z + entity.depth / 2 + PlayerRadius)
      }
    val free = Array.tabulate(side * side)(i => !segmentBlocked(x(i), z(i), x(i), z(i)))
    def anchors(px: Double, pz: Double): List[Int] =
      val values = mutable.ListBuffer.empty[Int]
      val minX = math.max(low, math.ceil(px - AnchorDistance).toInt)
      val maxX = math.min(high, math.floor(px + AnchorDistance).toInt)
      val minZ = math.max(low, math.ceil(pz - AnchorDistance).toInt)
      val maxZ = math.min(high, math.floor(pz + AnchorDistance).toInt)
      for gx <- minX to maxX; gz <- minZ to maxZ do
        val index = (gz - low) * side + gx - low
        val dx = gx - px
        val dz = gz - pz
        if free(index) && math.hypot(dx, dz) <= AnchorDistance && !segmentBlocked(px, pz, gx, gz) then
          values += index
      values.toList
    val visited = Array.fill(side * side)(false)
    val queue = mutable.ArrayDeque.empty[Int]
    anchors(startX, startZ).foreach { index =>
      visited(index) = true
      queue.append(index)
    }
    while queue.nonEmpty do
      val index = queue.removeHead()
      val neighbors = List(
        Option.when(index % side > 0)(index - 1),
        Option.when(index % side < side - 1)(index + 1),
        Option.when(index / side > 0)(index - side),
        Option.when(index / side < side - 1)(index + side)
      ).flatten
      neighbors.foreach { next =>
        if !visited(next) && free(next) && !segmentBlocked(x(index), z(index), x(next), z(next)) then
          visited(next) = true
          queue.append(next)
      }
    anchors(target.x, target.z).exists(visited(_))

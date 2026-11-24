package soda.parkour

import munit.FunSuite

final class ParkourEngineSuite extends FunSuite:
  private val C = ParkourGeometry.CellSize
  private def at(col: Int, row: Int): Vec = Cell(col, row).center
  private def room(level: Int, phase: Phase): World =
    ParkourWorld.enter(ParkourLevels.room(level, phase), 0, None, collected = false)
  private def idle(world: World, ticks: Int): World =
    (0 until ticks).foldLeft(world)((w, _) => ParkourEngine.step(w, Vec.zero, Action.Idle))

  test("first shift starts on the spawn checkpoint and moves right"):
    val started = ParkourEngine.step(room(1, Phase.Warm), Vec.zero, Action.Idle)
    assertEquals(started.checkpoint, Some(Cell(2, 9)))
    val moved = ParkourEngine.step(started, Vec(1, 0), Action.Idle)
    assert(moved.player.x > started.player.x)

  test("reading uses the cell in front, advances pages and ends"):
    val first = room(1, Phase.Warm).copy(player = at(4, 9), facing = Vec(1, 0))
    val reading = ParkourEngine.step(first, Vec.zero, Action.Read)
    assert(reading.reading.exists(_.page == 0))
    val done = ParkourEngine.step(reading, Vec.zero, Action.Read)
    assertEquals(done.reading, None)

    val second = room(1, Phase.Warm).copy(player = at(9, 7), facing = Vec(1, 0))
    val page0 = ParkourEngine.step(second, Vec.zero, Action.Read)
    assert(page0.reading.exists(_.page == 0))
    val page1 = ParkourEngine.step(page0, Vec.zero, Action.Read)
    assert(page1.reading.exists(_.page == 1))
    val ended = ParkourEngine.step(page1, Vec.zero, Action.Read)
    assertEquals(ended.reading, None)

  test("reading is invincible while a hazard is underfoot"):
    val hazard = ParkourLevels.room(3, Phase.Warm).hazards.head
    val base = room(3, Phase.Warm).copy(player = hazard.center,
      reading = Some(Reading(Cell(4, 9), 0, 1200, finalSign = false)))
    val stepped = ParkourEngine.step(base, Vec.zero, Action.Idle)
    assertEquals(stepped.dead, None)

  test("teleport crosses the three-cell wall in level six"):
    val start = room(6, Phase.Warm).copy(player = at(11, 9), facing = Vec(1, 0))
    val placed = ParkourEngine.step(start, Vec.zero, Action.Teleport)
    assert(placed.teleport.exists(_.target == Cell(15, 9)))
    val arrived = idle(placed, ParkourGeometry.TeleportDelay)
    assertEquals(arrived.teleport, None)
    assertEquals(arrived.player, Cell(15, 9).center)

  test("teleport refuses a wall or the outside"):
    val wall = room(6, Phase.Warm).copy(player = at(10, 9), facing = Vec(1, 0))
    val refused = ParkourEngine.step(wall, Vec.zero, Action.Teleport)
    assertEquals(refused.teleport, None)
    val edge = room(1, Phase.Warm).copy(player = at(27, 9), facing = Vec(1, 0))
    val outside = ParkourEngine.step(edge, Vec.zero, Action.Teleport)
    assertEquals(outside.teleport, None)

  test("touching the right exit slides into level two"):
    val exit = ParkourLevels.room(1, Phase.Warm).exit
    val stepped = ParkourEngine.step(room(1, Phase.Warm).copy(player = exit.center), Vec.zero, Action.Idle)
    assertEquals(stepped.level, 2)
    assert(stepped.transition.exists(t => t.toLevel == 2 && t.direction == 1))

  test("the client can hear new events after a respawn or restart in the same run"):
    val waiting = room(7, Phase.Cold).copy(nextEvent = 25, dead = Some(Death(Phase.Cold, 42)),
      checkpoint = Some(Cell(25, 9)))
    val revived = ParkourEngine.step(waiting, Vec.zero, Action.Read)
    assertEquals(revived.events.map(e => (e.id, e.kind)), Vector((25L, "respawn")))
    assertEquals(revived.player, Cell(25, 9).center)
    val finished = revived.copy(ending = Ending.Collected)
    val restarted = ParkourEngine.step(finished, Vec.zero, Action.Read)
    assertEquals(restarted.events.map(e => (e.id, e.kind)), Vector((26L, "restart")))

  test("cold creep fills from the right and kills a player who waits"):
    val cold = room(2, Phase.Cold)
    val waited = idle(cold, 110)
    assert(waited.dead.nonEmpty)
    assert(waited.creepX.exists(_ < ParkourGeometry.Width))

  test("forced removals are inactive from the start"):
    val cold = room(5, Phase.Cold)
    assert(!cold.activeCheckpoints.contains(Cell(15, 9)))
    assert(cold.pendingRemoval.exists(_._2 == Cell(15, 9)))

  test("collecting the mushroom turns level seven cold at the player"):
    val start = room(7, Phase.Warm).copy(player = at(24, 9), facing = Vec(1, 0))
    val collected = ParkourEngine.step(start, Vec.zero, Action.Read)
    assertEquals(collected.level, 7)
    assertEquals(collected.phase, Phase.Cold)
    assert(collected.collected)
    assertEquals(collected.checkpoint, Some(Cell(24, 9)))
    assert(collected.creepX.nonEmpty)

  test("level five briefly turns cold when the player walks far enough"):
    val start = room(5, Phase.Warm).copy(player = at(11, 9))
    val triggered = ParkourEngine.step(start, Vec.zero, Action.Idle)
    assertEquals(triggered.phase, Phase.Cold)
    assert(triggered.glitch.nonEmpty)

  test("level one alternates phase and leaves the hazard behind"):
    val start = room(1, Phase.Cold).copy(player = at(24, 9), facing = Vec(-1, 0))
    val toggled = ParkourEngine.step(start, Vec.zero, Action.Idle)
    assertEquals(toggled.phase, Phase.Warm)
    assertEquals(toggled.creepX, None)
    assert(toggled.switch.nonEmpty)

  test("final sign plus teleport reaches the collected ending"):
    val start = room(1, Phase.Cold).copy(player = at(2, 9), facing = Vec(0, -1))
    val reading = ParkourEngine.step(start, Vec.zero, Action.Read)
    assert(reading.reading.exists(_.finalSign))
    val rushing = ParkourEngine.step(reading, Vec.zero, Action.Teleport)
    assertEquals(rushing.ending, Ending.Rush)
    val lying = idle(rushing, 30)
    assertEquals(lying.ending, Ending.Lying)
    val collected = idle(lying, 50)
    assertEquals(collected.ending, Ending.Collected)
    val restarted = ParkourEngine.step(collected, Vec.zero, Action.Read)
    assertEquals(restarted.ending, Ending.None)
    assertEquals(restarted.level, 1)
    assertEquals(restarted.phase, Phase.Warm)

  final case class RouteStep(cell: Cell, teleport: Boolean)

  test("every room has a route, using teleport where the layout needs it"):
    for room <- ParkourLevels.rooms do
      val world = ParkourWorld.enter(room, 0, None, collected = false)
      assert(path(world, room.exit).nonEmpty,
        s"room ${room.level} ${room.phase} has no route to its exit")

  private def cellOf(at: Vec): Cell = Cell(math.floor(at.x / C).toInt, math.floor(at.y / C).toInt)

  private def blocked(world: World): Set[Cell] =
    world.definition.walls ++ world.definition.hazards ++ world.activeSigns ++
      (if world.collected then Set.empty else world.definition.mushroom.toSet)

  private def permitsTeleport(world: World): Boolean =
    world.level == 6 || (world.phase == Phase.Cold && world.level >= 2 && world.level <= 4)

  private def path(world: World, goal: Cell): Vector[RouteStep] =
    val start = cellOf(world.player)
    if start == goal then Vector.empty
    else
      val avoid = blocked(world)
      var seen = Set(start)
      def safe(cell: Cell): Boolean =
        cell.inside && !cell.border && !avoid.contains(cell) && !seen.contains(cell)
      var queue = Vector(Vector.empty[RouteStep] -> start)
      var answer = Vector.empty[RouteStep]
      var done = false
      while queue.nonEmpty && !done do
        val (route, cell) = queue.head
        queue = queue.tail
        val walks = Vector(Cell(cell.col + 1, cell.row), Cell(cell.col - 1, cell.row),
          Cell(cell.col, cell.row + 1), Cell(cell.col, cell.row - 1))
        for next <- walks do
          if !done then
            if next == goal then
              answer = route :+ RouteStep(next, teleport = false)
              done = true
            else if safe(next) then
              seen += next
              queue = queue :+ (route :+ RouteStep(next, teleport = false), next)
        if !done && permitsTeleport(world) then
          val directions = Vector(Cell(0, -1), Cell(1, -1), Cell(1, 0), Cell(1, 1),
            Cell(0, 1), Cell(-1, 1), Cell(-1, 0), Cell(-1, -1))
          for direction <- directions do
            val target = Cell(cell.col + direction.col * ParkourGeometry.TeleportDistance,
              cell.row + direction.row * ParkourGeometry.TeleportDistance)
            if !done then
              if target == goal then
                answer = route :+ RouteStep(target, teleport = true)
                done = true
              else if safe(target) then
                seen += target
                queue = queue :+ (route :+ RouteStep(target, teleport = true), target)
      answer

  private def settle(world: World): World =
    var current = world
    var guard = 0
    while (current.transition.nonEmpty || current.switch.nonEmpty) && guard < 100 do
      current = ParkourEngine.step(current, Vec.zero, Action.Idle)
      guard += 1
    current

  private def tame(world: World): World =
    var current = world
    if current.phase == Phase.Cold then
      current = current.copy(enteredAt = current.tick + 100000, bars = Vector.empty, scary = None)
    if current.level == 5 && current.phase == Phase.Warm then
      current = current.copy(triggered = true, glitch = None)
    if current.definition.script == Script.PhaseAlternating then current = current.copy(creepX = None)
    current

  private def walkTo(world: World, goal: Cell): World =
    var current = tame(settle(world))
    val roomLevel = current.level
    var guard = 0
    while current.level == roomLevel && cellOf(current.player) != goal && guard < 900 do
      guard += 1
      val route = path(current, goal)
      if route.isEmpty then
        fail(s"no path from ${cellOf(current.player)} to $goal in level ${current.level} ${current.phase}")
      val step = route.head
      if step.teleport then
        val here = cellOf(current.player)
        val direction = Vec(step.cell.col - here.col, step.cell.row - here.row).normalized
        current = tame(current.copy(facing = direction))
        current = waitTeleport(ParkourEngine.step(current, Vec.zero, Action.Teleport))
        if current.dead.nonEmpty then fail(s"died teleporting in level ${current.level}")
        if current.level == roomLevel && cellOf(current.player) != step.cell then
          fail(s"teleport landed at ${cellOf(current.player)} instead of ${step.cell} in level ${current.level}")
      else
        val direction = Vec(step.cell.center.x - current.player.x, step.cell.center.y - current.player.y).normalized
        var ticks = 0
        while current.level == roomLevel && cellOf(current.player) != step.cell && ticks < 12 do
          current = tame(ParkourEngine.step(current, direction, Action.Idle))
          if current.dead.nonEmpty then fail(s"died at ${cellOf(current.player)} in level ${current.level}")
          if current.transition.nonEmpty || current.switch.nonEmpty then current = tame(settle(current))
          ticks += 1
        if current.level == roomLevel && cellOf(current.player) != step.cell then
          fail(s"stuck moving ${cellOf(current.player)} -> ${step.cell} in level ${current.level}")
    current

  private def waitTeleport(world: World): World =
    (0 until (ParkourGeometry.TeleportDelay + 2)).foldLeft(world)((w, _) =>
      ParkourEngine.step(w, Vec.zero, Action.Idle))

  test("a complete run reaches the mushroom and the final sign"):
    var world = ParkourEngine.start()
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 2)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 3)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 4)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 5)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 6)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 7)
    val mushroom = world.definition.mushroom.get
    val approach = Vector(Cell(mushroom.col - 1, mushroom.row), Cell(mushroom.col + 1, mushroom.row),
      Cell(mushroom.col, mushroom.row - 1), Cell(mushroom.col, mushroom.row + 1))
      .find(cell => !blocked(world).contains(cell)).get
    world = walkTo(world, approach)
    world = world.copy(facing = Vec(mushroom.center.x - world.player.x, mushroom.center.y - world.player.y).normalized)
    world = settle(ParkourEngine.step(world, Vec.zero, Action.Read))
    assert(world.collected)
    assertEquals(world.level, 7)
    assertEquals(world.phase, Phase.Cold)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 6)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 5)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 4)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 3)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 2)
    world = walkTo(world, world.definition.exit)
    assertEquals(world.level, 1)
    world = walkTo(world, Cell(2, 9))
    world = world.copy(facing = Vec(0, -1))
    world = ParkourEngine.step(world, Vec.zero, Action.Read)
    assert(world.reading.exists(_.finalSign))
    world = ParkourEngine.step(world, Vec.zero, Action.Teleport)
    assertEquals(world.ending, Ending.Rush)
    world = (0 until 30).foldLeft(world)((w, _) => ParkourEngine.step(w, Vec.zero, Action.Idle))
    assertEquals(world.ending, Ending.Lying)
    world = (0 until 50).foldLeft(world)((w, _) => ParkourEngine.step(w, Vec.zero, Action.Idle))
    assertEquals(world.ending, Ending.Collected)

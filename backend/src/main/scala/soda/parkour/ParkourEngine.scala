package soda.parkour

object ParkourEngine:
  private val C = ParkourGeometry.CellSize
  private val Speed = ParkourGeometry.Speed
  private val FootW = ParkourGeometry.FootHalfWidth
  private val FootH = ParkourGeometry.FootHalfHeight
  private val Width = ParkourGeometry.Width
  private val Height = ParkourGeometry.Height

  private val Border: Set[Cell] =
    (for
      col <- 0 until ParkourGeometry.Columns
      row <- 0 until ParkourGeometry.Rows
      cell = Cell(col, row)
      if cell.border
    yield cell).toSet

  final case class Rect(x: Double, y: Double, w: Double, h: Double):
    def maxX: Double = x + w
    def maxY: Double = y + h
    def overlapsCell(cell: Cell): Boolean =
      x < cell.col * C + C && maxX > cell.col * C && y < cell.row * C + C && maxY > cell.row * C
    def overlaps(other: Rect): Boolean =
      x < other.maxX && maxX > other.x && y < other.maxY && maxY > other.y

  private def foot(at: Vec): Rect = Rect(at.x - FootW, at.y - FootH, FootW * 2, FootH * 2)
  private def cellAt(at: Vec): Cell = Cell(math.floor(at.x / C).toInt, math.floor(at.y / C).toInt)
  private def cellRect(cell: Cell): Rect = Rect(cell.col * C, cell.row * C, C, C)
  private def clamp(value: Double, low: Double, high: Double): Double = value.max(low).min(high)

  private def quantize(direction: Vec): Vec =
    def sign(value: Double): Double = if value > 0.25 then 1 else if value < -0.25 then -1 else 0
    val x = sign(direction.x)
    val y = sign(direction.y)
    if x == 0 && y == 0 then direction else Vec(x, y)

  private def facingCell(world: World): Cell =
    val f = quantize(world.facing)
    if f.x == 0 && f.y == 0 then
      if world.phase == Phase.Warm then Cell(1, 0) else Cell(-1, 0)
    else Cell(f.x.toInt, f.y.toInt)

  private def facingCells(world: World): Vector[Cell] =
    val directions = Vector(Cell(0, -1), Cell(1, -1), Cell(1, 0), Cell(1, 1),
      Cell(0, 1), Cell(-1, 1), Cell(-1, 0), Cell(-1, -1))
    val f = facingCell(world)
    val index = directions.indexOf(f) match
      case -1 => if world.phase == Phase.Warm then 2 else 6
      case found => found
    val origin = cellAt(world.player)
    Vector(directions(index), directions((index + 1) % 8), directions((index + 7) % 8))
      .map(origin + _)

  private def event(world: World, kind: String, at: Vec): World =
    val next = Event(world.nextEvent, kind, at.x, at.y)
    world.copy(events = (world.events :+ next).takeRight(ParkourWorld.EventLimit),
      nextEvent = world.nextEvent + 1)

  def start(tick: Long = 0): World = ParkourWorld.fresh(tick)

  private def solid(world: World, at: Vec): Boolean =
    val r = foot(at)
    val minCol = math.floor(r.x / C).toInt
    val maxCol = math.floor((r.maxX - 0.001) / C).toInt
    val minRow = math.floor(r.y / C).toInt
    val maxRow = math.floor((r.maxY - 0.001) / C).toInt
    (for
      col <- minCol to maxCol
      row <- minRow to maxRow
      cell = Cell(col, row)
      if cell.inside
    yield cell).exists { cell =>
      world.definition.walls.contains(cell) ||
      world.activeSigns.contains(cell) ||
      (world.phase == Phase.Warm && cell.border) ||
      (!world.collected && world.definition.mushroom.contains(cell))
    }

  private def hazard(world: World, at: Vec): Boolean =
    val r = foot(at)
    val cells = (for
      col <- 0 until ParkourGeometry.Columns
      row <- 0 until ParkourGeometry.Rows
      cell = Cell(col, row)
    yield cell)
    val staticHit = cells.exists { cell =>
      (world.definition.hazards.contains(cell) || (world.phase == Phase.Cold && cell.border)) &&
        r.overlapsCell(cell)
    }
    val creepHit = world.creepX.exists(boundary => r.maxX > boundary)
    val barHit = world.bars.exists(bar => r.overlaps(Rect(bar.x, bar.y, bar.w, bar.h)))
    val glitchHit = world.glitch.exists(box => r.overlaps(Rect(box.x, box.y, box.w, box.h)))
    val scaryHit = world.scary.exists(box => r.overlaps(Rect(box.x, box.y, box.w, box.h)))
    staticHit || creepHit || barHit || glitchHit || scaryHit

  private def move(world: World, direction: Vec): World =
    if world.teleport.nonEmpty || world.reading.nonEmpty ||
      world.transition.nonEmpty || world.dead.nonEmpty || world.ending != Ending.None then world
    else
      val motion = direction.normalized
      if motion.length < 0.1 then world
      else
        val x0 = clamp(world.player.x + motion.x * Speed, FootW, Width - FootW)
        val afterX = Vec(x0, world.player.y)
        val placedX = if solid(world, afterX) then world.player else afterX
        val y0 = clamp(placedX.y + motion.y * Speed, FootH, Height - FootH)
        val afterY = Vec(placedX.x, y0)
        val placed = if solid(world, afterY) then placedX else afterY
        world.copy(player = placed, facing = quantize(motion))

  private def frontCell(world: World): Cell = cellAt(world.player) + facingCell(world)

  private def startReading(world: World, sign: SignDef): World =
    event(world.copy(reading = Some(Reading(sign.cell, 0, ParkourGeometry.ReadTicks, sign.finalSign))),
      "sign", sign.cell.center)

  private def activateCheckpoints(world: World): World =
    val r = foot(world.player)
    world.definition.checkpoints.find(checkpoint =>
      !checkpoint.removed && world.activeCheckpoints.contains(checkpoint.cell) &&
        r.overlapsCell(checkpoint.cell)).fold(world) { checkpoint =>
      if world.checkpoint.contains(checkpoint.cell) then world
      else event(world.copy(checkpoint = Some(checkpoint.cell)), "checkpoint", checkpoint.cell.center)
    }

  private def tryTeleport(world: World): World =
    val target = cellAt(world.player) + facingCell(world) * ParkourGeometry.TeleportDistance
    if world.teleport.nonEmpty || !target.inside then world
    else if solid(world, target.center) then world
    else event(world.copy(teleport = Some(Teleport(target, ParkourGeometry.TeleportDelay))),
      "teleport", target.center)

  private def collectMushroom(world: World): World =
    val next = ParkourLevels.room(7, Phase.Cold)
    val cell = cellAt(world.player)
    val activeSigns = next.signs.filterNot(_.removed).map(_.cell).toSet
    val activeCheckpoints = next.checkpoints.filterNot(_.removed).map(_.cell).toSet
    val removal = (next.signs.filter(_.removed).map(_.cell) ++
      next.checkpoints.filter(_.removed).map(_.cell)).map(p => (world.tick + 4, p))
    val changed = world.copy(level = 7, definition = next, basePhase = Phase.Cold, phase = Phase.Cold,
      checkpoint = Some(cell), activeSigns = activeSigns, activeCheckpoints = activeCheckpoints,
      reading = None, teleport = None, switch = Some(Switch(Phase.Warm, Phase.Cold, ParkourGeometry.SwitchTicks)),
      creepX = Some(Width), bars = next.moving.map(m => Bar(m.x, m.y, m.w, m.h, m.minY, m.maxY, m.step, m.every)),
      glitch = None, scary = None, ending = Ending.None, collected = true,
      pendingRemoval = removal, enteredAt = world.tick, triggered = false, toggles = 0)
    event(changed, "mushroom", cell.center)

  private def applyAction(world: World, action: Action): World =
    action match
      case Action.Idle => world
      case Action.Teleport => tryTeleport(world)
      case Action.Read =>
        val front = cellAt(world.player) + facingCell(world)
        val nearbySign = facingCells(world).flatMap { cell =>
          world.definition.signs.find(sign => sign.cell == cell && !sign.removed &&
            world.activeSigns.contains(sign.cell))
        }.headOption
        nearbySign match
          case Some(sign) => startReading(world, sign)
          case None =>
            if !world.collected && world.definition.mushroom.contains(front) then collectMushroom(world)
            else world

  private def shiftTo(world: World, target: Phase, ticks: Int): World =
    world.copy(phase = target, switch = Some(Switch(world.phase, target, ticks)),
      creepX = if target == Phase.Cold then world.creepX else None)

  private def advanceRoom(world: World): World =
    var next = world
    // Deferred forced removals never become interactive; they only produce the strike.
    val due = next.pendingRemoval.filter(_._1 <= next.tick).map(_._2)
    next = next.copy(pendingRemoval = next.pendingRemoval.filter(_._1 > next.tick))
    due.foreach(cell => next = event(next, "lightning", cell.center))

    next.teleport match
      case Some(teleport) =>
        if teleport.ticks <= 1 then
          next = event(next.copy(player = teleport.target.center, teleport = None), "arrive", teleport.target.center)
        else next = next.copy(teleport = Some(teleport.copy(ticks = teleport.ticks - 1)))
      case None => ()

    if next.bars.nonEmpty && next.tick % 40 == 0 then
      next = next.copy(bars = next.bars.map { bar =>
        val upward = math.round((bar.y - bar.minY) / bar.step) % 2 == 1
        val candidate = if upward then bar.y - bar.step else bar.y + bar.step
        val bounced = if candidate < bar.minY || candidate > bar.maxY then bar.y - (candidate - bar.y) else candidate
        bar.copy(y = clamp(bounced, bar.minY, bar.maxY))
      })

    if next.definition.script == Script.GlitchWarm && !next.triggered && next.player.x > 160 then
      val box = HazardBox(Width - 32, 0, 32, Height)
      next = event(next.copy(phase = Phase.Cold, triggered = true, glitch = Some(box), glitchVx = -10,
        switch = Some(Switch(Phase.Warm, Phase.Cold, ParkourGeometry.SwitchTicks))), "glitch", Vec(Width - 16, Height / 2))

    next.glitch match
      case Some(box) =>
        val x = box.x + next.glitchVx
        if x < -48 then
          next = event(next.copy(glitch = None, phase = Phase.Warm,
            switch = Some(Switch(Phase.Cold, Phase.Warm, ParkourGeometry.SwitchTicks)), creepX = None),
            "calm", Vec(math.max(box.x, 0.0), box.y))
        else next = next.copy(glitch = Some(box.copy(x = x)))
      case None => ()

    if next.definition.script == Script.RushCold && next.scary.isEmpty && next.tick - next.enteredAt > 20 then
      next = next.copy(scary = Some(HazardBox(8, 0, C, Height)), scaryVx = 18, scaryStopX = 24 * C + C / 2)

    next.scary match
      case Some(box) =>
        val x = box.x + next.scaryVx
        next = next.copy(scary = Some(box.copy(x = x.min(next.scaryStopX))))
        if x >= next.scaryStopX - 0.5 && next.tick - next.enteredAt > 60 then
          next = next.copy(scary = None)
      case None => ()

    if next.definition.creep && next.phase == Phase.Cold &&
      next.tick - next.enteredAt > ParkourGeometry.CreepDelay then
      next = next.copy(creepX = next.creepX.map(x => (x - ParkourGeometry.CreepSpeed).max(0)))

    if next.definition.script == Script.PhaseAlternating &&
      next.reading.isEmpty && next.dead.isEmpty then
      val thresholds = Vector(400.0, 300.0, 200.0, 100.0)
      if next.toggles < thresholds.length && next.player.x < thresholds(next.toggles) then
        val target = if next.phase == Phase.Cold then Phase.Warm else Phase.Cold
        val toggled = next.copy(toggles = next.toggles + 1, phase = target,
          switch = Some(Switch(next.phase, target, ParkourGeometry.SwitchTicks)),
          creepX = if target == Phase.Cold then Some(next.player.x + C) else None)
        next = event(toggled, "phase", next.player)

    next

  private def enterRoom(world: World, level: Int, phase: Phase): World =
    val next = ParkourLevels.room(level, phase)
    val fresh = ParkourWorld.enter(next, world.tick, None, world.collected)
    val moved = world.copy(level = level, definition = next, basePhase = phase, phase = phase,
      player = next.spawn.center, facing = Vec(if phase == Phase.Warm then 1 else -1, 0),
      checkpoint = None, activeSigns = fresh.activeSigns, activeCheckpoints = fresh.activeCheckpoints,
      reading = None, dead = None, teleport = None, switch = None,
      transition = Some(Transition(world.level, world.phase, level, phase,
        if phase == Phase.Warm then 1 else -1, ParkourGeometry.TransitionTicks)),
      creepX = fresh.creepX, bars = fresh.bars, glitch = None, scary = None,
      ending = Ending.None, pendingRemoval = fresh.pendingRemoval,
      enteredAt = world.tick + ParkourGeometry.TransitionTicks, triggered = false, toggles = 0)
    event(moved, "level", next.spawn.center)

  private def checkExit(world: World): World =
    if world.dead.nonEmpty || world.reading.nonEmpty ||
      world.transition.nonEmpty || world.ending != Ending.None then world
    else if foot(world.player).overlapsCell(world.definition.exit) then
      if world.basePhase == Phase.Warm && world.level < 7 then enterRoom(world, world.level + 1, Phase.Warm)
      else if world.basePhase == Phase.Cold && world.level > 1 then enterRoom(world, world.level - 1, Phase.Cold)
      else world
    else world

  private def die(world: World): World =
    if world.dead.nonEmpty || world.reading.nonEmpty ||
      world.transition.nonEmpty || world.ending != Ending.None then world
    else if hazard(world, world.player) then
      event(world.copy(dead = Some(Death(world.phase, 0)), reading = None, teleport = None), "death", world.player)
    else world

  private def liveStep(world: World, direction: Vec, action: Action): World =
    val acted = applyAction(world, action)
    val walked = move(acted, direction)
    val checked = activateCheckpoints(walked)
    val advanced = advanceRoom(checked)
    val dead = die(advanced)
    checkExit(dead)

  private def readingStep(world: World, reading: Reading, action: Action): World =
    if reading.finalSign && action == Action.Teleport then
      event(world.copy(reading = None, ending = Ending.Rush, endingTicks = 0), "ending", world.player)
    else
      val sign = world.definition.signs.find(_.cell == reading.cell)
      val pages = sign.fold(1)(_.pages.length.max(1))
      def nextPage = if reading.page + 1 >= pages then None
      else Some(reading.copy(page = reading.page + 1, ticksLeft = ParkourGeometry.ReadTicks))
      val afterAction =
        if action == Action.Read then nextPage.fold(world.copy(reading = None))(p => world.copy(reading = Some(p)))
        else if reading.ticksLeft <= 1 then
          nextPage.fold(world.copy(reading = None))(p => world.copy(reading = Some(p)))
        else world.copy(reading = Some(reading.copy(ticksLeft = reading.ticksLeft - 1)))
      val advanced = advanceRoom(afterAction)
      // Reading is deliberately invincible: hazards still move, but contact cannot kill.
      advanced

  private def deadStep(world: World, death: Death, action: Action): World =
    if action == Action.Read then
      val kept = world.checkpoint
      val reset = ParkourWorld.enter(world.definition, world.tick, kept, world.collected)
      event(reset.copy(nextEvent = world.nextEvent), "respawn", reset.player)
    else world.copy(dead = Some(death.copy(ticks = death.ticks + 1)))

  private def transitionStep(world: World, transition: Transition): World =
    if transition.ticks <= 1 then world.copy(transition = None)
    else world.copy(transition = Some(transition.copy(ticks = transition.ticks - 1)))

  private def switchStep(world: World, switching: Switch): World =
    if switching.ticks <= 1 then world.copy(switch = None)
    else world.copy(switch = Some(switching.copy(ticks = switching.ticks - 1)))

  private def endingStep(world: World, action: Action): World =
    world.ending match
      case Ending.Rush =>
        val moving = world.copy(player = Vec(world.player.x - 8, world.player.y),
          endingTicks = world.endingTicks + 1)
        if moving.endingTicks >= 30 then moving.copy(ending = Ending.Lying, endingTicks = 0) else moving
      case Ending.Lying =>
        val lying = world.copy(endingTicks = world.endingTicks + 1)
        if lying.endingTicks >= 50 then lying.copy(ending = Ending.Collected, endingTicks = 0) else lying
      case Ending.Collected =>
        if action == Action.Read then
          val fresh = ParkourWorld.fresh(world.tick + 1).copy(nextEvent = world.nextEvent)
          event(fresh, "restart", fresh.player)
        else world
      case Ending.None => world

  def step(world: World, direction: Vec, action: Action): World =
    val ticked = world.copy(tick = world.tick + 1)
    val visual = ticked.switch match
      case Some(switching) =>
        if switching.ticks <= 1 then ticked.copy(switch = None)
        else ticked.copy(switch = Some(switching.copy(ticks = switching.ticks - 1)))
      case None => ticked
    if visual.ending != Ending.None then endingStep(visual, action)
    else visual.transition match
      case Some(transition) => transitionStep(visual, transition)
      case None => visual.dead match
        case Some(death) => deadStep(visual, death, action)
        case None => visual.reading match
          case Some(reading) => readingStep(visual, reading, action)
          case None => liveStep(visual, direction, action)

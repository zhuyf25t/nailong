package soda.night

object NightEngine:
  private val westWall = 12.0
  private val eastWall = 468.0
  private val windowLine = 78.0
  private val floorEnd = 288.0
  private val bottleSpeed = 12.0
  private val exit = NightPoint(240, 260)

  private def freshOrder(night: NightLevel): ShiftStage.Serving =
    ShiftStage.Serving(night.seconds.map(_ * 20), None, None, None, pristine = true)

  def start(level: NightLevel, seed: Long,trace: Vector[NightPoint] = Vector.empty,
            sounds: Vector[EchoBeat] = Vector.empty): NightWorld =
    val origin = NightPoint(240,220)
    val w = NightWorld(level, seed, 0, 0, 0, origin, Direction.Left, freshOrder(level), NightEvent.Start, 0,
      FactoryFloor.initial(level),None,if level.value == 1 then Vector(origin) else trace,sounds)
    w.copy(puzzle = StoryPuzzles.start(w))

  private def move(world: NightWorld, sample: NightInput): NightPoint =
    val scale = 4.0 / math.hypot(sample.mx, sample.my).max(1.0)
    val candidate = NightPoint(
      (world.player.x + scale * sample.mx).max(16).min(464),
      (world.player.y + scale * sample.my).max(98).min(267)
    )
    world.puzzle.fold(candidate)(StoryPuzzles.constrain(world,_,candidate))

  def step(world: NightWorld, sample: NightInput): NightWorld = world.stage match
    case ShiftStage.Won | ShiftStage.Escaped | ShiftStage.Lost => world
    case stage =>
      val position = move(world,sample)
      // Five samples per second, including pauses and turns, preserve the original pacing.
      // Keep the last two minutes of the completed shift if the player lingers indefinitely.
      val record = world.night.value == 1 && (world.tick + 1) % 4 == 0
      val current = world.copy(tick = world.tick + 1, player = position,
        firstNightTrace = if record then (world.firstNightTrace :+ position).takeRight(600) else world.firstNightTrace)
      (stage,current.puzzle) match
        case (_: ShiftStage.Serving,Some(puzzle)) =>
          StoryPuzzles.step(current,puzzle,sample) match
            case PuzzleTransition.Continue(next,where) => current.copy(puzzle=Some(next),player=where.getOrElse(position))
            case PuzzleTransition.Receipt(next,clean,where,beats) =>
              current.copy(delivered=current.delivered+1,clean=current.clean+(if clean then 1 else 0),
                puzzle=Some(next),player=where.getOrElse(position),
                firstNightSounds=if current.night.value==1 && beats.nonEmpty then beats.takeRight(3) else current.firstNightSounds)
                .emit(NightEvent.Deliver)
            case PuzzleTransition.Finish(next) =>
              current.copy(stage=ShiftStage.Won,puzzle=Some(next)).emit(NightEvent.Won)
        case (order: ShiftStage.Serving,_) =>
          val (floor, fell) = FactoryFloor.advance(current)
          if fell then floor else serve(floor,order,sample)
        case (chase: ShiftStage.Escaping,_) => escape(current, chase)
        case (ShiftStage.Clockout,_) if current.player.distance(exit) <= 23 =>
          current.copy(stage = ShiftStage.Won).emit(NightEvent.Won)
        case _ => current

  private def serve(world: NightWorld, initial: ShiftStage.Serving, sample: NightInput): NightWorld =
    val order = initial.copy(gesture = initial.gesture.filter(_.expires > world.tick))
    val (cued, active) = sample.action match
      case NightAction.Probe if order.bottle.isEmpty =>
        val direction = if sample.ax < 0 then Direction.Left else Direction.Right
        val reveal = world.tick + world.night.fogDelay
        (world.emit(NightEvent.Probe), order.copy(lastProbe = Some(direction),
          gesture = Some(Gesture(direction, reveal, reveal + 40))))
      case NightAction.Toss if order.bottle.isEmpty &&
          (FactoryFloor.lane(world) == DispatchLane.Loading || FactoryFloor.lane(world) == DispatchLane.Outside) =>
        (world.copy(floor = world.floor.announce(FactoryCue.RouteBlocked,world.tick)).emit(NightEvent.Blocked),order)
      case NightAction.Toss if order.bottle.isEmpty =>
        val length = math.hypot(sample.ax, sample.ay)
        val (vx, vy) = if length < 1.0e-8 then (0.0, -bottleSpeed)
          else (sample.ax / length * bottleSpeed, sample.ay / length * bottleSpeed)
        (world.emit(NightEvent.Throw), order.copy(bottle = Some(Bottle(world.player, vx, vy, bounced = false, world.bank))))
      case _ => (world, order)
    val settled = active.bottle.fold(cued.copy(stage = active))(fly(cued, active, _, 1.0))
    settled.stage match
      // A delivery on the last tick counts. The next bottle starts with its full budget.
      case order: ShiftStage.Serving if settled.delivered == world.delivered =>
        val pressure = order.pressure.map(_ - 1)
        if pressure.contains(0) then intruder(settled)
        else settled.copy(stage = order.copy(pressure = pressure))
      case _ => settled

  // Intersect the actual swept segment with side rails and counter. Resolving the
  // earlier contact first preserves bank shots even if two edges fall in one tick.
  private def fly(world: NightWorld, order: ShiftStage.Serving, shot: Bottle, duration: Double): NightWorld =
    val at = shot.at
    def point(t: Double): NightPoint = NightPoint(at.x + shot.vx * t, at.y + shot.vy * t)
    val side = if shot.vx < 0 then (westWall - at.x) / shot.vx
      else if shot.vx > 0 then (eastWall - at.x) / shot.vx else Double.PositiveInfinity
    val end = if shot.vy < 0 then (windowLine - at.y) / shot.vy
      else if shot.vy > 0 then (floorEnd - at.y) / shot.vy else Double.PositiveInfinity
    if end <= side && end <= duration then
      if shot.vy > 0 then failedShot(world, order, NightEvent.Miss)
      else receive(world, order, point(end).x, shot.bounced,shot.requiresBank)
    else if side <= duration then
      if shot.bounced then failedShot(world, order, NightEvent.Miss)
      else
        val boundary = if shot.vx < 0 then westWall else eastWall
        val reflected = shot.copy(at = NightPoint(boundary, point(side).y), vx = -shot.vx, bounced = true)
        fly(world.emit(NightEvent.Bounce), order, reflected, duration - side)
    else world.copy(stage = order.copy(bottle = Some(shot.copy(at = point(duration)))))

  private def failedShot(world: NightWorld, order: ShiftStage.Serving, event: NightEvent): NightWorld =
    world.copy(stage = order.copy(bottle = None, pristine = false)).emit(event)

  private def receive(world: NightWorld, order: ShiftStage.Serving, x: Double, bounced: Boolean, bankRequired: Boolean): NightWorld =
    world.night.windows.find(slot => math.abs(slot.x - x) <= 35.0) match
      case None => failedShot(world, order, NightEvent.Miss)
      case Some(_) if bankRequired && !bounced => failedShot(world, order, NightEvent.Blocked)
      case Some(slot) if slot != world.recipient => intruder(world)
      case Some(_) =>
        val count = world.delivered + 1
        val floor = if world.night.value == 2 && count == 1 then world.floor.announce(FactoryCue.DoubleThanks,world.tick)
          else world.floor
        val next = world.copy(delivered = count, clean = world.clean + (if order.pristine then 1 else 0),
          memory = order.lastProbe.getOrElse(world.memory),floor = floor)
        if world.night.value == 6 && count == 2 then
          val ready = next.copy(stage = freshOrder(world.night)).emit(NightEvent.Deliver)
          ready.copy(puzzle = StoryPuzzles.start(ready))
        else if count == 3 then next.copy(stage = ShiftStage.Clockout).emit(NightEvent.Clockout)
        else next.copy(stage = freshOrder(world.night)).emit(NightEvent.Deliver)

  private def intruder(world: NightWorld): NightWorld =
    val budget = (if world.night.value >= 7 then 10 else 12) * 20
    val nearest = world.night.windows.minBy(slot => math.abs(slot.x - world.player.x))
    val stage = ShiftStage.Escaping(budget, latched = false, NightPoint(nearest.x, 87), world.tick + 25)
    world.copy(stage = stage).emit(NightEvent.Intruder)

  private def trackPlayer(hunter: NightPoint, player: NightPoint): NightPoint =
    val distance = hunter.distance(player)
    if distance <= 2.2 then player
    else
      val step = 2.2 / distance
      NightPoint(hunter.x + (player.x - hunter.x) * step, hunter.y + (player.y - hunter.y) * step)

  private def escape(world: NightWorld, chase: ShiftStage.Escaping): NightWorld =
    val panel = NightPoint(if world.lever == Direction.Left then 46 else 434, 220)
    val reached = world.player.distance(panel) <= 18
    val hunting = world.tick > chase.risesUntil
    val hunter = if hunting then trackPlayer(chase.hunter, world.player) else chase.hunter
    if chase.latched && world.player.distance(exit) <= 23 then
      world.copy(stage = ShiftStage.Escaped).emit(NightEvent.Escape)
    else if chase.ticks <= 1 || (hunting && hunter.distance(world.player) <= 13) then
      world.copy(stage = ShiftStage.Lost).emit(NightEvent.Lost)
    else
      val next = world.copy(stage = chase.copy(ticks = chase.ticks - 1, latched = chase.latched || reached, hunter = hunter))
      if reached && !chase.latched then next.emit(NightEvent.Lever) else next

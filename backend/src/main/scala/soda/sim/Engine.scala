package soda.sim

object Engine:
  val tickHz = 20
  val timeLimit = 120 * tickHz
  val radius = 5.0
  private val walkSpeed = 2.45

  def start(arena: Arena, mode: Mode): World =
    val fighters = Seat.values.toVector.map(s => Fighter.spawn(s, arena.spawns(s.index)))
    val flags = if mode == Mode.Ctf then Team.values.toVector.map(t => Flag(t, arena.bases(t.ordinal), None)) else Vector.empty
    World(SimTick.start, mode, fighters, Vector.empty, arena.pickups.map(Bottle(_, 0)), flags, Scores(0, 0), Vector.empty, None)

  def step(arena: Arena, world: World, humans: Map[Seat, Controls]): World =
    if world.result.nonEmpty then world
    else
      val current = world.copy(clock = world.clock.next,
        events = world.events.dropWhile(_.tick <= world.tick + 1 - tickHz),
        pickups = world.pickups.map(b => b.copy(cooldown = (b.cooldown - 1).max(0))))
      val moved = world.fighters.foldLeft(current) { (next, fighter) =>
        val input = humans.getOrElse(fighter.seat, Bots.controls(arena, world, fighter))
        advanceFighter(arena, next, fighter, input)
      }
      val impacted = moved.shots.foldLeft(moved.copy(shots = Vector.empty))((w, s) => advanceShot(arena, w, s))
      val supplied = collectBottles(impacted)
      val scored = if world.mode == Mode.Ctf then advanceFlags(supplied) else supplied
      scored.copy(result = outcome(scored))

  private def advanceFighter(arena: Arena, world: World, f: Fighter, input: Controls): World =
    if !f.alive then
      if f.respawnTicks > 1 then world.put(f.copy(respawnTicks = f.respawnTicks - 1))
      else
        val fresh = Fighter.spawn(f.seat, arena.spawns(f.seat.index), f.kills, f.deaths)
        world.put(fresh).emit(Cue.Respawn, fresh.seat, fresh.position)
    else
      val aim = if input.aim == Vec.zero then f.aim else input.aim
      val base = f.copy(weapon = input.weapon, aim = aim, inventory = f.inventory.map(_.advance),
        invulnTicks = (f.invulnTicks-1).max(0), shieldTicks = (f.shieldTicks-1).max(0),
        dashCd = (f.dashCd-1).max(0), shieldCd = (f.shieldCd-1).max(0), fireLock = (f.fireLock-1).max(0))
      val dash = base.dashCd == 0 && input.dash
      val shield = base.shieldCd == 0 && input.shield
      val velocity =
        if dash then (if input.move == Vec.zero then aim else input.move) * 20.0
        else input.move * walkSpeed
      val moved = base.copy(position = arena.move(f.position, velocity), dashCd = if dash then 60 else base.dashCd,
        shieldTicks = if shield then 30 else base.shieldTicks, shieldCd = if shield then 160 else base.shieldCd)
      val afterDash = if dash then world.emit(Cue.Dash, f.seat, moved.position) else world
      val afterShield = if shield then afterDash.emit(Cue.Shield, f.seat, moved.position) else afterDash
      val mag = moved.magazine
      if mag.loading == 0 && mag.rounds < mag.weapon.capacity && (input.reload || (input.fire && mag.rounds == 0)) then
        afterShield.put(moved.setMagazine(mag.startReload)).emit(Cue.Reload, f.seat, moved.position)
      else if input.fire && moved.fireLock == 0 then
        mag.consume match
          case None => afterShield.put(moved)
          case Some(spent) =>
            val gun = moved.weapon
            val fresh = gun.angles.zipWithIndex.map { case (angle, pellet) =>
              Shot(world.tick * 16 + f.seat.index * 4 + pellet, f.seat, moved.position,
                aim.rotate(angle) * gun.speed, gun, gun.lifetime)
            }
            afterShield.copy(shots = afterShield.shots ++ fresh)
              .put(moved.setMagazine(spent).copy(fireLock = gun.interval, invulnTicks = 0))
              .emit(Cue.Fire, f.seat, moved.position)
      else afterShield.put(moved)

  private enum Contact:
    case Wall
    case Actor(seat: Seat)

  private def advanceShot(arena: Arena, world: World, shot: Shot): World =
    val projectileRadius = if shot.weapon == Weapon.Pearl then 2.7 else 1.4
    val samples = math.ceil(shot.velocity.length / 1.4).toInt.max(1)
    val foes = world.fighters.filter(f => f.alive && f.seat != shot.owner &&
      (world.mode == Mode.Ffa || shot.owner.team != f.team))
    val contact = (1 to samples).iterator.map(i => shot.position + shot.velocity * (i.toDouble / samples))
      .map { p =>
        if !arena.clear(p, projectileRadius) then Some(Contact.Wall)
        else foes.find(_.position.distance(p) <= radius + projectileRadius).map(f => Contact.Actor(f.seat))
      }.collectFirst { case Some(hit) => hit }
    contact match
      case Some(Contact.Actor(seat)) => hit(world, shot, world.fighter(seat))
      case Some(Contact.Wall) => world
      case None if shot.life <= 1 => world
      case None => world.copy(shots = world.shots :+ shot.copy(position = shot.position + shot.velocity, life = shot.life - 1))

  private def hit(world: World, shot: Shot, target: Fighter): World =
    if target.invulnTicks > 0 then world
    else
      val damage = if target.shieldTicks > 0 then math.ceil(shot.weapon.damage * 0.3).toInt else shot.weapon.damage
      val damaged = target.copy(hp = target.hp.damaged(damage))
      val tagged = world.put(damaged).emit(Cue.Hit, shot.owner, target.position, Some(target.seat))
      if damaged.alive then tagged
      else
        val shooter = tagged.fighter(shot.owner)
        val popped = tagged.put(shooter.copy(kills = shooter.kills + 1))
          .put(damaged.copy(respawnTicks = 40, shieldTicks = 0, invulnTicks = 0, deaths = damaged.deaths + 1))
          .emit(Cue.Pop, shot.owner, target.position, Some(target.seat))
        popped.carrying(target.seat).fold(popped) { team =>
          val flag = popped.flags(team.ordinal)
          popped.copy(flags = popped.flags.updated(team.ordinal, flag.copy(carrier = None)))
            .emit(Cue.Return, target.seat, flag.home)
        }

  private def collectBottles(world: World): World =
    world.pickups.zipWithIndex.foldLeft(world) { case (next, (bottle, index)) =>
      if bottle.cooldown > 0 then next
      else next.fighters.find(f => f.alive && f.hp.value < 100 && f.position.distance(bottle.position) <= 9).fold(next) { f =>
        next.copy(pickups = next.pickups.updated(index, bottle.copy(cooldown = 200)))
          .put(f.copy(hp = f.hp.healed(40))).emit(Cue.Heal, f.seat, bottle.position)
      }
    }

  private def advanceFlags(world: World): World =
    val taken = world.flags.foldLeft(world) { (next, flag) =>
      if flag.carrier.isDefined then next
      else next.fighters.find(f => f.alive && f.team != flag.team && f.position.distance(flag.home) <= 9)
        .fold(next)(f => next.copy(flags = next.flags.updated(flag.team.ordinal, flag.copy(carrier = Some(f.seat))))
          .emit(Cue.Take, f.seat, flag.home))
    }
    taken.flags.foldLeft(taken) { (next, flag) =>
      flag.carrier.fold(next) { seat =>
        val own = next.flags(seat.team.ordinal)
        if own.carrier.nonEmpty || next.fighter(seat).position.distance(own.home) > 9 then next
        else next.copy(flags = next.flags.updated(flag.team.ordinal, flag.copy(carrier = None)), scores = next.scores.add(seat.team))
          .emit(Cue.Capture, seat, own.home)
      }
    }

  private def outcome(w: World): Option[Outcome] = w.mode match
    case Mode.Ffa =>
      val top = w.fighters.map(_.kills).max
      Option.when(top >= 8 || w.tick >= timeLimit) {
        val leaders = w.fighters.filter(_.kills == top)
        if leaders.size == 1 then Outcome.Winner(leaders.head.seat) else Outcome.Draw
      }
    case Mode.Ctf =>
      val scores = w.scores
      Option.when(scores.mint >= 2 || scores.berry >= 2 || w.tick >= timeLimit) {
        if scores.mint == scores.berry then Outcome.Draw
        else Outcome.TeamWinner(if scores.mint > scores.berry then Team.Mint else Team.Berry)
      }

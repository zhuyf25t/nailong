package soda.sim

private[sim] object Bots:
  def controls(arena: Arena, world: World, bot: Fighter): Controls =
    val enemies = world.fighters.filter(f => f.alive && f.seat != bot.seat &&
      (world.mode == Mode.Ffa || f.team != bot.team))
    val marked = enemies.find(f => world.carrying(f.seat).contains(bot.team))
    val visible = enemies.filter(f => arena.lineOfSight(bot.position, f.position))
    val target = marked.filter(visible.contains).orElse(visible.minByOption(_.position.distance(bot.position)))
    val closest = enemies.minByOption(_.position.distance(bot.position))
    val bottle = world.pickups.filter(_.cooldown == 0).minByOption(_.position.distance(bot.position))
    val objective =
      if bot.hp.value <= 46 && bottle.exists(_.position.distance(bot.position) < 110) then bottle.map(_.position)
      else if world.mode == Mode.Ctf then
        val home = world.flags.find(_.team == bot.team)
        val away = world.flags.find(_.team == bot.team.other)
        if world.carrying(bot.seat).nonEmpty && home.exists(_.carrier.isEmpty) then home.map(_.home)
        else if marked.isDefined then marked.map(_.position)
        else away.flatMap(f => f.carrier.map(s => world.fighter(s).position).orElse(Some(f.home)))
      else closest.map(_.position)
    val travel = objective.fold(Vec.zero)(p => arena.pathDirection(bot.position, p))
    val distance = target.fold(Double.PositiveInfinity)(_.position.distance(bot.position))
    val gun =
      if distance < 62 then Weapon.Star
      else if distance > 145 && bot.seat.index % 2 == 1 then Weapon.Pearl
      else Weapon.Foam
    // A slight rhythmic aim error and a reaction beat keep arena-mates beatable.
    val sight = target.fold(bot.aim)(f => (f.position - bot.position).unit)
    val wobble = math.sin(world.tick * 0.12 + bot.seat.index * 2.0) * 0.089
    val aim = sight.rotate(wobble)
    val strafe = if ((world.tick / 27 + bot.seat.index) % 2 == 0) then 1.0 else -1.0
    val movement =
      if world.mode == Mode.Ffa && distance < 77 && bot.hp.value > 46 then
        val across = Vec(-sight.y, sight.x) * strafe
        val proposed = (across - sight * 0.28).unit
        if arena.move(bot.position, proposed * 3).distance(bot.position) > 1 then proposed else travel
      else travel
    val trigger = target.exists(_.invulnTicks == 0) && distance < (if gun == Weapon.Star then 90 else 225) &&
      (world.tick + bot.seat.index * 6) % 35 < 28
    val panic = bot.hp.value < 64 && distance < 110
    Controls(movement, aim, trigger, gun, !trigger && bot.inventory(gun.index).rounds < gun.capacity / 2,
      movement.length > 0 && (world.tick + bot.seat.index * 31) % 123 == 0,
      panic && (world.tick + bot.seat.index * 3) % 11 == 0)

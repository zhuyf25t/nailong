package soda.night

import munit.FunSuite

final class RelaySuite extends FunSuite:
  private def make(n: Int,leg: RelayLeg = RelayLeg.Dispatch,seed: Long = 1): (NightWorld,Relay) =
    val w = NightEngine.start(NightLevel.from(n).get,seed)
    (w,Relay.start(w,leg))
  private def move(w: NightWorld,in: NightInput): NightWorld =
    val scale = 4/math.hypot(in.mx,in.my).max(1)
    w.copy(player=NightPoint((w.player.x+scale*in.mx).max(16).min(464),(w.player.y+scale*in.my).max(98).min(267)),
      tick=w.tick+1)
  private def advance(w: NightWorld,r: Relay,in: NightInput): (NightWorld,Relay) =
    val next = move(w,in)
    (next,Relay.step(next,r,in))
  private def idle(w: NightWorld,r: Relay,ticks: Int): Relay =
    (0 until ticks).foldLeft(r)((s,_) => Relay.step(w,s,NightInput.idle))
  private def toward(w: NightWorld,p: NightPoint,a: String): NightInput = RelayTestPlayer.sample(w,w.player,p,a)
  private def has(r: Relay,s: RelaySignal): Boolean = r.events.exists(_.kind==s)
  private def arrive(w: NightWorld,r: Relay): (NightWorld,Relay) =
    Iterator.iterate((w,r)){ (state,parcel) =>
      val bottle = Relay.view(state,parcel).bottles.head
      advance(state,parcel,RelayTestPlayer.sample(state,bottle.intercept,state.player,"none"))
    }.take(180).find((s,p) => Relay.view(s,p).bottles.head.catchable).get
  private def ready(w: NightWorld,r: Relay): (NightWorld,Relay) =
    val (s,at) = arrive(w,r)
    val next = Relay.step(s,at,toward(s,s.player,"catch"))
    assertEquals(Relay.view(s,next).bottles.head.state,ParcelLook.Held)
    (s,next)
  private def finish(w: NightWorld,r: Relay): (NightWorld,Relay) =
    Iterator.iterate((w,r)){ (s,p) => advance(s,p,RelayTestPlayer.next(s,p)) }
      .take(650).find(_._2.complete).getOrElse(fail(s"unreached ${r.leg} / ${w.night.value}"))

  test("a fresh timed press catches the neck; holding early cannot claim it; one lower belt saves a miss") {
    val (w,r) = make(1)
    val early = Relay.step(w,r,toward(w,w.player,"catch"))
    assert(has(early,RelaySignal.Miss))
    val late = Iterator.iterate(early)(Relay.step(w,_,NightInput.idle)).dropWhile(p => !has(p,RelaySignal.Lower)).next()
    val (rescuer,saved) = ready(w,late)
    assert(!saved.clean)
    val bad = Relay.step(rescuer,saved,toward(rescuer,NightPoint(rescuer.player.x,280),"release"))
    val again = idle(rescuer,bad,12)
    assert(has(again,RelaySignal.Retry))
    assertEquals(Relay.view(rescuer,again).bottles.head.state,ParcelLook.Inbound)
    assert(!again.clean)
  }

  test("both night-four routes physically deliver; the branch plays first-night sound gaps while the player crosses") {
    val (w,r) = make(4)
    val (done,straight) = finish(w,r)
    assert(has(straight,RelaySignal.Sign))
    assert(has(straight,RelaySignal.SideFace))
    assert(!straight.recaught,Iterator.iterate((w,r)){ (s,p) => advance(s,p,RelayTestPlayer.next(s,p)) }
      .takeWhile(!_._2.complete).flatMap{ (s,p) =>
        p.events.filter(e => e.atTick==p.tick && e.kind!=RelaySignal.Step).map(e=>s"${p.tick} ${e.kind} ${s.player}")
      }.mkString("\n"))
    assertEquals(Relay.view(done,straight).stage,RelayStage.Complete)
    val (interceptor,cargo) = ready(w,r)
    val in = Relay.view(interceptor,cargo).inlet
    val release = Relay.step(interceptor,cargo,toward(interceptor,in,"release"))
    val branch = Iterator.iterate(release)(Relay.step(interceptor,_,NightInput.idle)).take(15).find(has(_,RelaySignal.Loop)).get
    val shot = Relay.step(interceptor,branch,toward(interceptor,Relay.view(interceptor,branch).switch,"probe"))
    val diverted = Iterator.iterate(shot)(Relay.step(interceptor,_,NightInput.idle)).take(20).find(_.routed).get
    val (crossed,again) = ready(interceptor,diverted)
    assert(again.recaught)
    assert(crossed.player.x > 290)
    val (_,looped) = finish(crossed,again)
    assert(looped.complete)
  }

  test("the same real cap can ring the rail, flip its paddle, and stop in a genuine hand") {
    val n = NightLevel.from(4).get
    val w = (0L to 40L).map(s => NightEngine.start(n,s)).find(_.recipient==WindowSlot.West).get.copy(player=NightPoint(380,265))
    val r = Relay.start(w,RelayLeg.Dispatch)
    val aim = NightPoint(936-104,78)
    val shot = Relay.step(w,r,toward(w,aim,"probe"))
    val after = idle(w,shot,28)
    val signals = after.events.map(_.kind)
    assert(signals.contains(RelaySignal.CapBounce),signals.toString)
    assertEquals(signals.count(_==RelaySignal.Switch),1)
    assert(signals.contains(RelaySignal.CapCaught),signals.toString)
    assert(after.cap.isEmpty)
    val untouched = Relay.view(w,r).json.noSpaces
    assert(!untouched.contains("recipient") && !untouched.contains("genuine"))
  }

  test("fifth-night echo takes its own track and plays the captured intervals; not every hand can stop a cap") {
    val (base,_) = make(5)
    val tape = Vector(EchoBeat(EchoKind.Step,0),EchoBeat(EchoKind.Pipe,5),EchoBeat(EchoKind.Bell,12))
    val w = base.copy(firstNightSounds=tape)
    val r = Relay.start(w,RelayLeg.Dispatch)
    assertEquals(Relay.view(w,r).bottles.size,2)
    val probe = Relay.step(w,r,toward(w,Relay.view(w,r).switch,"probe"))
    val playback = idle(w,probe,28)
    val beats = playback.events.filter(e => Set(RelaySignal.ReplayStep,RelaySignal.ReplayPipe,RelaySignal.ReplayBell)(e.kind))
    assertEquals(beats.map(_.kind),Vector(RelaySignal.ReplayStep,RelaySignal.ReplayPipe,RelaySignal.ReplayBell))
    assertEquals(beats.map(_.atTick).sliding(2).map(g=>g.last-g.head).toVector,Vector(5,12))
    val decoy = w.night.windows.find(_!=w.recipient).get
    val observed = idle(w,Relay.step(w,r,toward(w,NightPoint(decoy.x,78),"probe")),15)
    assert(has(observed,RelaySignal.CapThrough))
    assert(!has(observed,RelaySignal.CapCaught))
    assert(finish(w,r)._2.complete)
  }

  test("a hissing held bottle gives an anchored warning, can be evaded, and loses only the current parcel") {
    val (w,r) = make(4)
    val (runner,caught) = ready(w,r)
    val hiss = idle(runner,caught,36)
    assert(has(hiss,RelaySignal.Hiss))
    val warn = idle(runner,hiss,15)
    assertEquals(warn.hunter.state,ListenState.Warn)
    val target = warn.hunter.target
    val missed = idle(runner,warn,20)
    assert(has(missed,RelaySignal.Retry))
    val escaped = (0 until 16).foldLeft((runner,warn)){ case ((s,p),_) =>
      advance(s,p,RelayTestPlayer.sample(s,NightPoint(315,220),target,"none"))
    }
    assert(!has(escaped._2,RelaySignal.Retry))
    assert(has(escaped._2,RelaySignal.HandStrike))
  }

  test("maintenance and sleeping frog take a sounding bottle on a real second catch") {
    for leg <- Vector(RelayLeg.Maintenance,RelayLeg.FrogLure) do
      val n = if leg==RelayLeg.Maintenance then 6 else 8
      val (base,_) = make(n,leg)
      val w = base.copy(firstNightSounds=Vector(EchoBeat(EchoKind.Step,0),EchoBeat(EchoKind.Bell,3)))
      val (_,finalR) = finish(w,Relay.start(w,leg))
      assert(finalR.recaught)
      assert(finalR.complete)
  }

  test("a long first-night break cannot create a multi-minute gap on the fourth bottle's recording") {
    val (w,r) = make(1)
    val (runner,caught) = ready(w,r)
    val rest = idle(runner,caught,260)
    val (_,signed) = finish(runner,rest)
    assertEquals(signed.recording,Vector(EchoBeat(EchoKind.Bell,0)))
  }

  test("outward throws leave impact and rescue-track coordinates inside the public canvas") {
    val (w,r) = make(1)
    val (runner,held) = ready(w,r)
    for aim <- Vector(NightPoint(-800,220),NightPoint(900,220),NightPoint(164,600)) do
      val flight = Relay.step(runner,held,toward(runner,aim,"release"))
      val drop = Iterator.iterate(flight)(Relay.step(runner,_,NightInput.idle)).take(50).find(has(_,RelaySignal.Lower)).get
      val view = Relay.view(runner,drop)
      assert((view.events.map(_.point) ++ view.bottles.flatMap(_.track)).forall(p =>
        p.x>=0 && p.x<=480 && p.y>=0 && p.y<=288))
  }

  test("orders in the crossover change the intercept in view; the training rack stays familiar") {
    for n <- 1 to 4 do
      val (w,_) = make(n)
      val intercepts = (0 to 2).map { delivered =>
        val shift = w.copy(delivered=delivered)
        Relay.view(shift,Relay.start(shift,RelayLeg.Dispatch)).bottles.head.intercept
      }
      assertEquals(intercepts.distinct.size,if n == 1 then 1 else 3)
  }

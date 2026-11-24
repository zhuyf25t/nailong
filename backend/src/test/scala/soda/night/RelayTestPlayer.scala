package soda.night

import io.circe.{ACursor,Json}

/** The test player sees the same points, lamp states and glass reactions as Godot. */
private[night] object RelayTestPlayer:
  private def num(a: ACursor,k: String): Double = a.get[Double](k).toOption.get
  private def word(a: ACursor,k: String): String = a.get[String](k).toOption.get
  private def xy(a: ACursor): NightPoint = NightPoint(num(a,"x"),num(a,"y"))
  private def items(a: ACursor,k: String): Vector[ACursor] =
    a.get[Vector[Json]](k).toOption.get.map(_.hcursor)
  def next(w: NightWorld,r: Relay): NightInput =
    val v = Relay.view(w,r).json.hcursor
    val cargo = items(v,"bottles").find(b => word(b,"kind")=="cargo").get
    val panes = items(v,"windows")
    val history = items(v,"events")
    val held = word(cargo,"state")=="held"
    val carrying = if held then w.player else NightPoint(num(cargo,"catchX"),num(cargo,"catchY"))
    val state = word(cargo,"state")
    val leg = word(v,"leg")
    val move = if Set("flight","signed").contains(state) then
      if leg == "signature" then NightPoint(371,146) else w.player
    else carrying
    val switch = xy(v.downField("switch"))
    val inlet = xy(v.downField("inlet"))
    val selected = panes.find(p => word(p,"reaction")=="caught").orElse {
      val hit = history.reverseIterator.find(e => word(e,"kind")=="cap_caught").map(num(_,"slot"))
      panes.find(p => hit.contains(num(p,"slot")))
    }.orElse(Option.when(panes.size==1)(panes.head))
    val checked = history.filter(e => word(e,"kind")=="cap_through").map(num(_,"slot")).toSet
    val unknown = panes.find(p => !checked.contains(num(p,"slot")) && word(p,"reaction")!="through")
    val available = v.downField("cap").focus.contains(Json.Null)
    val needSwitch = (leg=="frog_switch" || leg=="signature" || w.night.value==5) && word(v,"route")=="left"
    val waitInlet = (leg=="maintenance" || leg=="frog_lure") && word(v,"objective").contains("进带口")
    val (action,aim) =
      if !held && cargo.get[Boolean]("catchable").contains(true) then ("catch",w.player)
      else if needSwitch && available then ("probe",switch)
      else if held && waitInlet then ("release",inlet)
      else if held && selected.exists { pane =>
        val remaining = num(pane,"openTicks")
        pane.get[Boolean]("open").contains(true) && (remaining<0 || remaining > math.ceil(w.player.distance(xy(pane))/16)+2)
      } then ("release",xy(selected.get))
      else if selected.isEmpty && unknown.nonEmpty && available then ("probe",xy(unknown.get))
      else ("none",w.player)
    sample(w,move,aim,action)

  def sample(w: NightWorld,move: NightPoint,aim: NightPoint,action: String): NightInput =
    val m = move.distance(w.player)
    val a = aim.distance(w.player).max(1)
    NightInput.from(if m<2 then 0 else (move.x-w.player.x)/m,if m<2 then 0 else (move.y-w.player.y)/m,
      (aim.x-w.player.x)/a,(aim.y-w.player.y)/a,action).get

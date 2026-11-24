package soda.night

import io.circe.Json
import io.circe.syntax.*

enum StoryTileState(val wire: String):
  case Solid extends StoryTileState("solid")
  case Warn extends StoryTileState("warn")
  case Hole extends StoryTileState("hole")
  case Mend extends StoryTileState("mend")

final case class StoryTile(x: Int,y: Int,state: StoryTileState,ticks: Int):
  def beneath(p: NightPoint): Boolean = math.abs(x - p.x) <= 12 && math.abs(y - p.y) <= 12
  def tick: StoryTile = (state,ticks) match
    case (StoryTileState.Solid,_) => this
    case (_,n) if n > 1 => copy(ticks = n - 1)
    case (StoryTileState.Warn,_) => copy(state = StoryTileState.Hole,ticks = 32)
    case (StoryTileState.Hole,_) => copy(state = StoryTileState.Mend,ticks = 16)
    case _ => copy(state = StoryTileState.Solid,ticks = 0)

final case class StoryPerson(x: Double,y: Double,kind: String,slot: Int)
final case class StoryMark(x: Int,y: Int,kind: String)
final case class StoryView(step: String,room: String,objective: String,cue: String,cueId: Int,
                           tiles: Vector[StoryTile],people: Vector[StoryPerson],marks: Vector[StoryMark],
                           stageTick: Int,round: Int = 0,sleepTicks: Int = 0,sleepMax: Int = 0,
                           braceTicks: Int = 0,braceMax: Int = 0,plateTicks: Option[Int] = None):
  def json: Json = Json.obj("step" -> step.asJson,"room" -> room.asJson,"objective" -> objective.asJson,
    "cue" -> cue.asJson,"cueId" -> cueId.asJson,"stageTick" -> stageTick.asJson,"round" -> round.asJson,
    "sleepTicks" -> sleepTicks.asJson,"sleepMax" -> sleepMax.asJson,"braceTicks" -> braceTicks.asJson,"braceMax" -> braceMax.asJson,
    "tiles" -> Json.fromValues(tiles.map(t => Json.obj("x" -> t.x.asJson,"y" -> t.y.asJson,"state" -> t.state.wire.asJson,"ticks" -> t.ticks.asJson))),
    "people" -> Json.fromValues(people.map(p => Json.obj("x" -> p.x.asJson,"y" -> p.y.asJson,"kind" -> p.kind.asJson,"slot" -> p.slot.asJson))),
    "marks" -> Json.fromValues(marks.map(m => Json.obj("x" -> m.x.asJson,"y" -> m.y.asJson,"kind" -> m.kind.asJson))))
    .deepMerge(plateTicks.fold(Json.obj())(value => Json.obj("plateTicks" -> value.asJson)))

enum PuzzleTransition:
  case Continue(state: PuzzleWorld,reposition: Option[NightPoint] = None)
  case Finish(state: PuzzleWorld)

enum FactoryCue(val wire: String):
  case Warm extends FactoryCue("warm")
  case Knock extends FactoryCue("knock")
  case DoubleThanks extends FactoryCue("double_thanks")
  case None extends FactoryCue("none")
  case TileWarn extends FactoryCue("tile_warn")
  case TileOpen extends FactoryCue("tile_open")
  case TileFall extends FactoryCue("tile_fall")
  case SawHand extends FactoryCue("saw_hand")
  case RouteBlocked extends FactoryCue("route_blocked")

enum DispatchLane:
  case Ordinary, Loading, Outside, Safe, Bank

final case class FactoryFloor(tiles: Vector[StoryTile],supplied: Boolean,cue: FactoryCue,cueId: Int,
                              since: Int,handUntil: Int):
  def announce(value: FactoryCue,tick: Int): FactoryFloor = copy(cue = value,cueId = cueId + 1,since = tick)

object FactoryFloor:
  private val rack = NightPoint(240,220)
  private val supply = StoryMark(240,154,"supply")
  private val lanes = Vector(StoryMark(48,148,"safe"),StoryMark(432,148,"safe"),StoryMark(240,174,"bank"))
  private def near(player: NightPoint, mark: StoryMark, radius: Int): Boolean =
    player.distance(NightPoint(mark.x,mark.y)) <= radius

  def initial(n: NightLevel): FactoryFloor =
    val coords = n.value match
      case 3 => (24 to 456 by 24).map((_,190)).toVector
      case 4 => (for x <- 168 to 312 by 24; y <- Vector(190,166) if x != 240 || y != 166 yield (x,y)).toVector
      case _ => Vector.empty
    val first = if n.value == 1 then FactoryCue.Warm else if n.value == 2 then FactoryCue.Knock else FactoryCue.None
    FactoryFloor(coords.map((x,y) => StoryTile(x,y,StoryTileState.Solid,0)),n.value != 3,first,0,0,0)

  def lane(w: NightWorld): DispatchLane =
    if !w.floor.supplied then DispatchLane.Loading
    else if w.night.value != 4 || w.order == 1 then DispatchLane.Ordinary
    else if lanes.take(2).exists(near(w.player,_,24)) then DispatchLane.Safe
    else if near(w.player,lanes.last,25) then DispatchLane.Bank
    else DispatchLane.Outside

  def advance(w: NightWorld): (NightWorld,Boolean) =
    val before = w.floor
    val ticks = before.tiles.map(_.tick)
    val onBrass = w.night.value == 4 && near(w.player,lanes.last,11)
    def standingOn(tile: StoryTile): Boolean = !onBrass && tile.beneath(w.player)
    val armed = ticks.map { tile =>
      if tile.state == StoryTileState.Solid && standingOn(tile) then tile.copy(state=StoryTileState.Warn,ticks=20)
      else tile
    }
    val floor = before.copy(tiles = armed)
    if armed.exists(t => t.state == StoryTileState.Hole && standingOn(t)) then
      val reset = ShiftStage.Serving(w.night.seconds.map(_ * 20),None,None,None,pristine = false)
      (w.copy(player = rack, stage = reset, floor = floor.announce(FactoryCue.TileFall,w.tick)),true)
    else if !floor.supplied && near(w.player,supply,16) then
      (w.copy(floor = floor.copy(supplied = true,handUntil = w.tick + 90).announce(FactoryCue.SawHand,w.tick)), false)
    else
      val switched = before.tiles.zip(armed)
      val cue = if switched.exists((a,b) => a.state == StoryTileState.Warn && b.state == StoryTileState.Hole)
        then Some(FactoryCue.TileOpen)
        else if switched.exists((a,b) => a.state == StoryTileState.Solid && b.state == StoryTileState.Warn)
        then Some(FactoryCue.TileWarn) else None
      // Keep the first sight of the supporting hand on screen while that tile crumbles.
      val next = cue.filter(_ => floor.handUntil <= w.tick).fold(floor)(floor.announce(_,w.tick))
      (w.copy(floor = next),false)

  def view(w: NightWorld): StoryView =
    val laneNight = w.night.value == 4 && w.order >= 2
    val step = if !w.floor.supplied then "supply" else if laneNight then "route" else "delivery"
    val objective = w.phase match
      case NightPhase.Clockout => "瓶架已经清空。走到南门打卡下班。"
      case NightPhase.Escaping => "窗闩开了。先碰亮起的泄压拉杆，再跑向南门。"
      case _ if !w.floor.supplied => "走过闪动的地砖，到北侧黄标取瓶。砖亮起后一秒内离开。"
      case _ if laneNight => "绕到两侧蓝台可直投；穿过中线裂砖到黄台，用侧墙反弹送货。"
      case _ => w.night.value match
        case 1 => "瞄准上方2号窗，点左键送汽水。"
        case 2 => "敲门声总慢一拍。朝交班条的反方向弹盖，找眼睛真正跟着动的那位。"
        case 3 => "等毛玻璃后的手伸出来。轮到你送瓶了。"
        case 5 => "两扇窗只学会一个方向。先朝左再朝右弹盖，找两次都跟着转头的那位。"
        case 6 => "先送两瓶。后场已经响起交班铃。"
        case _ => "看清收货员再投瓶。"
    val activeMarks = if !w.floor.supplied then Vector(supply) else if laneNight then lanes else Vector.empty
    val hand = Option.when(w.floor.handUntil > w.tick)(StoryMark(240,190,"hand")).toVector
    StoryView(step,"factory",objective,w.floor.cue.wire,w.floor.cueId,w.floor.tiles,Vector.empty,
      activeMarks ++ hand,w.tick - w.floor.since)

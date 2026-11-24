package soda.night

import io.circe.Json
import io.circe.syntax.*

/** Public story.relay is null or an object with the fields below. Coordinates are world pixels; all times
  * are 20 Hz ticks. Every event includes its simulation tick. Retries keep the tick and event id monotonic.
  * leg, tick, stage, route ("left"/"right"), caps, clean, objective
  * bottles[{id,kind("cargo"/"echo"),state("inbound"/"lower"/"loop"/"held"/"flight"/"signed"),
  *          x,y,catchX,catchY,eta,window,radius,catchable,sounds[{kind("step"/"pipe"/"bell"),gap}]}]
  * cap: null | {x,y,bounced}, windows[{slot,x,y,halfWidth,open,reaction,ticks}]
  * switch:{x,y}, inlet:{x,y}, rack:{x,y}, hunter:{x,y,targetX,targetY,state,ticks},
  * events[{id,kind,x,y,slot,atTick}]. See RelaySignal for the complete event vocabulary.
  * eta counts down to zero at the centre of the intercept, then becomes negative, window is its full width.
  * catchable includes distance to the real bottle and the time window. Non-rail states have eta=-1.
  * Catch, Release and Probe each consume exactly one input edge. Holding a bottle requires no repeat packets.
  */
enum RelayLeg(val wire: String):
  case Dispatch extends RelayLeg("dispatch")
  case Maintenance extends RelayLeg("maintenance")
  case Signature extends RelayLeg("signature")
  case FrogSwitch extends RelayLeg("frog_switch")
  case FrogLure extends RelayLeg("frog_lure")

enum RelayStage(val wire: String):
  case Running extends RelayStage("running")
  case Signed extends RelayStage("signed")
  case Complete extends RelayStage("complete")

enum Belt(val wire: String):
  case Inbound extends Belt("inbound")
  case Lower extends Belt("lower")
  case Loop extends Belt("loop")

enum RelaySignal(val wire: String):
  case Incoming extends RelaySignal("incoming")
  case Catch extends RelaySignal("catch")
  case Miss extends RelaySignal("miss")
  case Lower extends RelaySignal("lower")
  case Break extends RelaySignal("break")
  case Retry extends RelaySignal("retry")
  case Release extends RelaySignal("release")
  case Loop extends RelaySignal("loop")
  case Switch extends RelaySignal("switch")
  case CapFire extends RelaySignal("cap_fire")
  case CapBounce extends RelaySignal("cap_bounce")
  case CapCaught extends RelaySignal("cap_caught")
  case CapThrough extends RelaySignal("cap_through")
  case Pipe extends RelaySignal("pipe")
  case Step extends RelaySignal("step")
  case ReplayStep extends RelaySignal("replay_step")
  case ReplayPipe extends RelaySignal("replay_pipe")
  case ReplayBell extends RelaySignal("replay_bell")
  case HandWarn extends RelaySignal("hand_warn")
  case HandStrike extends RelaySignal("hand_strike")
  case WindowHit extends RelaySignal("window_hit")
  case Late extends RelaySignal("late")
  case Sign extends RelaySignal("sign")
  case SideFace extends RelaySignal("side_face")
  case Empty extends RelaySignal("empty")
  case Hiss extends RelaySignal("hiss")

final case class RelayEvent(id: Int,kind: RelaySignal,point: NightPoint,slot: Int,atTick: Int):
  def json: Json = Json.obj("id" -> id.asJson,"kind" -> kind.wire.asJson,"x" -> point.x.asJson,
    "y" -> point.y.asJson,"slot" -> slot.asJson,"atTick" -> atTick.asJson)

enum ListenState(val wire: String):
  case Quiet extends ListenState("quiet")
  case Turn extends ListenState("turn")
  case Chase extends ListenState("chase")
  case Warn extends ListenState("warn")
  case Strike extends ListenState("strike")

final case class RelayHunter(at: NightPoint, target: NightPoint, state: ListenState, ticks: Int):
  def json: Json = Json.obj("x" -> at.x.asJson,"y" -> at.y.asJson,"targetX" -> target.x.asJson,
    "targetY" -> target.y.asJson,"state" -> state.wire.asJson,"ticks" -> ticks.asJson)

enum PaneReaction(val wire: String):
  case None extends PaneReaction("none")
  case Caught extends PaneReaction("caught")
  case Through extends PaneReaction("through")

final case class RelayWindow(slot: Int, at: NightPoint, halfWidth: Double, open: Boolean,
                             reaction: PaneReaction, ticks: Int,openTicks: Int):
  def json: Json = Json.obj("slot" -> slot.asJson,"x" -> at.x.asJson,"y" -> at.y.asJson,
    "halfWidth" -> halfWidth.asJson,"open" -> open.asJson,"reaction" -> reaction.wire.asJson,"ticks" -> ticks.asJson,
    "openTicks" -> openTicks.asJson)

private[night] object RelayView:
  def xy(p: NightPoint): Json = Json.obj("x" -> p.x.asJson,"y" -> p.y.asJson)
  def sounds(track: Vector[EchoBeat]): Json = Json.fromValues(track.map(b =>
    Json.obj("kind" -> b.kind.wire.asJson,"gap" -> b.gap.asJson)))

enum ParcelLook(val wire: String):
  case Inbound extends ParcelLook("inbound")
  case Lower extends ParcelLook("lower")
  case Loop extends ParcelLook("loop")
  case Held extends ParcelLook("held")
  case Flight extends ParcelLook("flight")
  case Signed extends ParcelLook("signed")

final case class RelayBottleView private[night](id: Int, kind: ParcelKind,state: ParcelLook,at: NightPoint,
    intercept: NightPoint,eta: Int,window: Int,radius: Int,catchable: Boolean,sounds: Vector[EchoBeat],track: Vector[NightPoint]):
  def json: Json = Json.obj("id"->id.asJson,"kind"->kind.wire.asJson,"state"->state.wire.asJson,"x"->at.x.asJson,"y"->at.y.asJson,
    "catchX"->intercept.x.asJson,"catchY"->intercept.y.asJson,"eta"->eta.asJson,"window"->window.asJson,"radius"->radius.asJson,
    "catchable"->catchable.asJson,"sounds"->RelayView.sounds(sounds),"track"->Json.fromValues(track.map(RelayView.xy)))

final case class RelayCapView(at: NightPoint,bounced: Boolean):
  def json: Json = Json.obj("x"->at.x.asJson,"y"->at.y.asJson,"bounced"->bounced.asJson)

final case class RelayView private[night](leg: RelayLeg,tick: Int,stage: RelayStage,switched: Boolean,caps: Int,clean: Boolean,
    bottles: Vector[RelayBottleView],cap: Option[RelayCapView],windows: Vector[RelayWindow],switch: NightPoint,rack: NightPoint,
    inlet: NightPoint,pipes: Vector[NightPoint],hunter: RelayHunter,events: Vector[RelayEvent],objective: String,
    routed: Boolean,recaught: Boolean):
  def json: Json = Json.obj("leg"->leg.wire.asJson,"tick"->tick.asJson,"stage"->stage.wire.asJson,
    "route"->(if switched then "right" else "left").asJson,"caps"->caps.asJson,"clean"->clean.asJson,
    "bottles"->Json.fromValues(bottles.map(_.json)),"cap"->cap.fold(Json.Null)(_.json),"windows"->Json.fromValues(windows.map(_.json)),
    "switch"->RelayView.xy(switch),"rack"->RelayView.xy(rack),"inlet"->RelayView.xy(inlet),"pipes"->Json.fromValues(pipes.map(RelayView.xy)),
    "hunter"->hunter.json,"events"->Json.fromValues(events.map(_.json)),"objective"->objective.asJson,
    "routed"->routed.asJson,"recaught"->recaught.asJson)

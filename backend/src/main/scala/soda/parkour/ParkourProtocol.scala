package soda.parkour

import java.util.UUID
import scala.util.Try

private def canonicalUUID(raw: String): Option[UUID] =
  Try(UUID.fromString(raw)).toOption.filter(_.toString.equalsIgnoreCase(raw))

opaque type RunId = UUID
object RunId:
  def fresh(): RunId = UUID.randomUUID()
  def read(raw: String): Option[RunId] = canonicalUUID(raw)
  extension (id: RunId) def uuid: UUID = id

opaque type StartId = UUID
object StartId:
  def read(raw: String): Option[StartId] = canonicalUUID(raw)
  extension (id: StartId) def uuid: UUID = id

opaque type InputSequence = Long
object InputSequence:
  def from(value: Long): Option[InputSequence] =
    Option.when(value >= 0 && value <= 9007199254740991L)(value)
  extension (seq: InputSequence) def value: Long = seq

enum ParkourProblem(val code: String, val message: String):
  case NotFound extends ParkourProblem("run_not_found", "这局跑酷没有开始，或已经被新的对局替换。")
  case Busy extends ParkourProblem("input_queue_full", "动作太快，请稍后重试。")
  case Replaced extends ParkourProblem("run_replaced", "之前的开局请求已经结束。请重新开始。")

enum Action:
  case Idle, Read, Teleport

object Action:
  def read(raw: String): Option[Action] = raw match
    case "none" => Some(Action.Idle)
    case "read" => Some(Action.Read)
    case "teleport" => Some(Action.Teleport)
    case _ => None

enum Phase:
  case Warm, Cold

object Phase:
  def wire(value: Phase): String = if value == Phase.Warm then "warm" else "cold"

final case class Vec(x: Double, y: Double):
  def length: Double = math.hypot(x, y)
  def normalized: Vec =
    val n = length
    if n < 0.0001 then Vec(0, 0) else Vec(x / n, y / n)
  def +(other: Vec): Vec = Vec(x + other.x, y + other.y)
  def *(scale: Double): Vec = Vec(x * scale, y * scale)

object Vec:
  val zero: Vec = Vec(0, 0)

final case class Cell(col: Int, row: Int):
  def center: Vec = Vec(col * ParkourGeometry.CellSize + ParkourGeometry.CellSize / 2.0,
    row * ParkourGeometry.CellSize + ParkourGeometry.CellSize / 2.0)
  def +(other: Cell): Cell = Cell(col + other.col, row + other.row)
  def *(scale: Int): Cell = Cell(col * scale, row * scale)
  def inside: Boolean =
    col >= 0 && col < ParkourGeometry.Columns && row >= 0 && row < ParkourGeometry.Rows
  def border: Boolean =
    col == 0 || col == ParkourGeometry.Columns - 1 || row == 0 || row == ParkourGeometry.Rows - 1

object ParkourGeometry:
  val CellSize: Double = 16.0
  val Columns: Int = 30
  val Rows: Int = 18
  val Width: Double = Columns * CellSize
  val Height: Double = Rows * CellSize
  val FootHalfWidth: Double = 4.0
  val FootHalfHeight: Double = 2.4
  val Speed: Double = 4.0
  val ReadTicks: Int = 1200
  val TeleportDelay: Int = 3
  val TeleportDistance: Int = 4
  val DeathPromptTicks: Int = 40
  val TransitionTicks: Int = 12
  val SwitchTicks: Int = 18
  val CreepDelay: Int = 30
  val CreepSpeed: Double = 3.6

final case class InputSample(seq: Long, mx: Double, my: Double, action: Action):
  def movement: Vec = Vec(mx, my).normalized

package soda.sim

import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import io.circe.parser.decode
import scala.annotation.tailrec

private[sim] final case class Tile(x: Int, y: Int)
private[sim] final case class Layout(tileSize: Int, rows: Vector[String], spawns: Vector[Tile],
                                     bases: Vector[Tile], pickups: Vector[Tile])

/** Path distances and wall geometry are shared by all rooms, characters and projectiles. */
final class Arena private (layout: Layout):
  val tileSize: Int = layout.tileSize
  val width: Int = layout.rows.head.length
  val height: Int = layout.rows.size
  val spawns: Vector[Vec] = layout.spawns.map(center)
  val bases: Vector[Vec] = layout.bases.map(center)
  val pickups: Vector[Vec] = layout.pickups.map(center)
  private def center(t: Tile): Vec = Vec((t.x + 0.5) * tileSize, (t.y + 0.5) * tileSize)
  private def tile(v: Vec): Tile = Tile(math.floor(v.x / tileSize).toInt, math.floor(v.y / tileSize).toInt)
  private def index(t: Tile): Int = t.y * width + t.x
  private def fromIndex(i: Int): Tile = Tile(i % width, i / width)
  private def open(t: Tile): Boolean =
    t.x >= 0 && t.y >= 0 && t.x < width && t.y < height && layout.rows(t.y)(t.x) == '.'
  private val neighbors = Vector.tabulate(width * height) { i =>
    val t = fromIndex(i)
    Vector(Tile(t.x + 1, t.y), Tile(t.x, t.y + 1), Tile(t.x - 1, t.y), Tile(t.x, t.y - 1))
      .filter(open).map(index)
  }

  // Expand one band of reachable tiles at a time. Every tile in the band has equal cost.
  @tailrec
  private def flood(frontier: Vector[Int], costs: Vector[Int], depth: Int): Vector[Int] =
    val next = frontier.flatMap(neighbors).filter(costs(_) == Int.MaxValue).distinct
    if next.isEmpty then costs
    else flood(next, next.foldLeft(costs)((known, tile) => known.updated(tile, depth)), depth + 1)

  private val distances = Vector.tabulate(width * height) { goal =>
    val unvisited = Vector.fill(width * height)(Int.MaxValue)
    if open(fromIndex(goal)) then flood(Vector(goal), unvisited.updated(goal, 0), 1)
    else unvisited
  }
  private[sim] def connected: Boolean =
    val reachable = distances(index(layout.spawns.head))
    layout.rows.indices.forall(y => layout.rows(y).indices.forall(x =>
      !open(Tile(x,y)) || reachable(index(Tile(x,y))) != Int.MaxValue))

  def wall(point: Vec): Boolean = !open(tile(point))
  def clear(position: Vec, radius: Double): Boolean =
    val left = tile(Vec(position.x - radius, position.y - radius))
    val right = tile(Vec(position.x + radius, position.y + radius))
    (left.y to right.y).forall(y => (left.x to right.x).forall { x =>
      open(Tile(x,y)) || {
        val nx = position.x.max(x * tileSize).min((x + 1) * tileSize)
        val ny = position.y.max(y * tileSize).min((y + 1) * tileSize)
        val dx = position.x - nx
        val dy = position.y - ny
        dx * dx + dy * dy >= radius * radius
      }
    })

  def move(from: Vec, delta: Vec): Vec =
    val count = math.ceil(delta.length / 2.5).toInt.max(1)
    val step = delta * (1.0 / count)
    (0 until count).foldLeft(from) { (p, _) =>
      val side = Vec(p.x + step.x, p.y)
      val x = if clear(side, Engine.radius) then side.x else p.x
      val fore = Vec(x, p.y + step.y)
      if clear(fore, Engine.radius) then fore else Vec(x, p.y)
    }

  def lineOfSight(from: Vec, to: Vec): Boolean =
    val delta = to - from
    val count = math.ceil(delta.length / 3.0).toInt.max(1)
    (1 to count).forall(i => !wall(from + delta * (i.toDouble / count)))

  def pathDirection(from: Vec, to: Vec): Vec =
    val a = tile(from)
    val b = tile(to)
    if !open(a) || !open(b) then Vec.zero
    else if a == b then (to - from).unit
    else
      val costs = distances(index(b))
      val candidates = neighbors(index(a)).filter(n => costs(n) < costs(index(a)))
      candidates.minByOption(n => (costs(n), center(fromIndex(n)).distance(to))) match
        case None => Vec.zero
        case Some(next) => (center(fromIndex(next)) - from).unit

object Arena:
  private given Decoder[Tile] = deriveDecoder
  private given Decoder[Layout] = deriveDecoder
  def fromJson(raw: String): Either[String, Arena] =
    decode[Layout](raw).left.map(_.getMessage).flatMap { layout =>
      val rows = layout.rows
      val dimensions = layout.tileSize == 16 && rows.size == 18 && rows.forall(_.length == 30)
      val walls = dimensions && rows.forall(r => r.forall(".#".contains(_)) && r.head == '#' && r.last == '#') &&
        rows.head.forall(_ == '#') && rows.last.forall(_ == '#')
      val landmarks = layout.spawns ++ layout.bases ++ layout.pickups
      val validPoints = dimensions && landmarks.forall(t => rows.lift(t.y).flatMap(_.lift(t.x)).contains('.'))
      if !walls || !validPoints || layout.spawns.size != 4 || layout.bases.size != 2 ||
          layout.pickups.isEmpty || layout.pickups.size > 32 || landmarks.distinct.size != landmarks.size then
        Left("Invalid 30x18 arena walls or landmarks")
      else
        val arena = new Arena(layout)
        Either.cond(arena.connected, arena, "Arena contains disconnected walkable tiles")
    }

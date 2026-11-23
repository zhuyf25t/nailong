package soda.rooms

import cats.effect.{IO, Ref, Resource}
import cats.syntax.all.*
import io.circe.Json
import java.time.Instant
import java.util.UUID
import scala.concurrent.duration.*
import soda.identity.{Identity, PlayerId}
import soda.sim.*

private final case class Pilot(identity: Identity, skin: Skin, ack: Long, seen: Int, inputTick: Int, input: Controls)
private final case class Participant(seat: Seat, skin: Skin, creditedKills: Int)
private final case class Room(id: MatchId, code: RoomCode, mode: Mode, world: World, pilots: Map[Seat, Pilot],
                              players: Map[PlayerId, Participant], finished: Option[Finished], stored: Boolean):
  def seatOf(id: PlayerId): Option[Seat] = pilots.collectFirst { case (seat, p) if p.identity.player == id => seat }
  def enter(seat: Seat, user: Identity, skin: Skin): Room =
    val prior = players.get(user.player).fold(0)(_.creditedKills)
    copy(pilots = pilots.updated(seat, Pilot(user, skin, -1, world.tick, world.tick, Controls.idle)),
      players = players.updated(user.player, Participant(seat, skin, prior)))
  def leave(id: PlayerId): Room =
    if finished.isDefined then this else copy(pilots = pilots.filterNot(_._2.identity.player == id))
  def view(seat: Seat): Json =
    val bots = Vector("波波教练", "糖霜队员", "啵啵蛙", "奶油队长")
    val botSkins = Vector(Skin.Dragon, Skin.Egg, Skin.Frog, Skin.Dragon)
    val seats = Seat.values.toVector.map { s =>
      val p = pilots.get(s)
      Json.obj("slot" -> Json.fromInt(s.index), "name" -> Json.fromString(p.fold(bots(s.index))(_.identity.name.value)),
        "skin" -> Json.fromString(p.fold(botSkins(s.index))(_.skin).wire), "human" -> Json.fromBoolean(p.isDefined))
    }
    Json.obj("matchId" -> Json.fromString(id.value.toString), "code" -> Json.fromString(code.value),
      "you" -> Json.fromInt(seat.index), "ack" -> Json.fromLong(pilots.get(seat).fold(-1L)(_.ack)),
      "seats" -> Json.fromValues(seats), "state" -> Wire.state(world))

  def step(arena: Arena, now: Instant): Room =
    if finished.isDefined then this
    else
      val connected = pilots.filter { case (_, pilot) => world.tick - pilot.seen < 160 }
      val inputs = connected.map { case (s, p) =>
        s -> (if world.tick - p.inputTick < 6 then p.input else p.input.released)
      }
      val next = Engine.step(arena, world, inputs)
      val ledger = connected.foldLeft(players) { case (acc, (s, p)) =>
        val earned = (next.fighters(s.index).kills - world.fighters(s.index).kills).max(0)
        acc.updatedWith(p.identity.player)(_.map(prev => prev.copy(creditedKills = prev.creditedKills + earned)))
      }
      val terminal = next.result.map { result =>
        val standings = ledger.iterator.map { case (id, stats) =>
          val stayed = connected.get(stats.seat).exists(_.identity.player == id)
          Standing(id, stats.skin, stats.creditedKills, if stayed then result.forSeat(stats.seat) else Verdict.Loss)
        }.toVector
        Finished(id, code, mode, now, standings)
      }
      copy(world = next, pilots = connected.view.mapValues(p => p.copy(input = p.input.withoutEdges)).toMap,
        players = ledger, finished = terminal)

private enum Membership:
  case Create(mode: Mode, skin: Skin)
  case Join(code: RoomCode, skin: Skin)
private final case class Receipt(action: Membership, matchId: MatchId, code: RoomCode)
private final case class Registry(rooms: Map[RoomCode,Room], receipts: Map[(PlayerId, RequestId),Receipt]):
  def detach(player: PlayerId, except: RoomCode): Registry =
    copy(rooms = rooms.map { case (code, room) => code -> (if code == except then room else room.leave(player)) })
  def advance(arena: Arena, now: Instant): Registry =
    val updated = rooms.filterNot { case (_, r) => r.stored && r.finished.exists(_.endedAt.plusSeconds(300).isBefore(now)) }
      .view.mapValues(_.step(arena, now)).toMap
    Registry(updated, receipts.filter { case (_, receipt) => updated.contains(receipt.code) })

final class Rooms private (arena: Arena, data: Ref[IO,Registry], results: Results):
  private type Reply = Either[RoomError,(Room,Seat)]
  private def expose(reply: Reply): IO[Either[RoomError,Json]] = reply match
    case Left(e) => IO.pure(Left(e))
    case Right((room,seat)) =>
      store(room).as(Right(room.view(seat)))

  private def store(room: Room): IO[Unit] =
    if room.stored then IO.unit
    else room.finished.traverse_ { ended =>
      results.record(ended) *> data.update { registry =>
        registry.copy(rooms = registry.rooms.updatedWith(room.code)(_.map { current =>
          if current.id == room.id then current.copy(stored = true) else current
        }))
      }
    }

  private def membership(user: Identity, req: RequestId, action: Membership)
                       (allocate: Registry => Either[RoomError,(Room,Seat)]): IO[Either[RoomError,Json]] =
    val key = (user.player,req)
    data.modify { old =>
      old.receipts.get(key) match
        case Some(saved) if saved.action != action => (old, Left(RoomError.Reused))
        case Some(saved) =>
          val current = for
            room <- old.rooms.get(saved.code) if room.id == saved.matchId
            seat <- room.seatOf(user.player)
          yield (room,seat)
          (old, current.toRight(RoomError.Expired))
        case None => allocate(old) match
          case Left(error) => (old, Left(error))
          case Right((room,seat)) =>
            val moved = old.detach(user.player, room.code)
            val updated = moved.copy(rooms = moved.rooms.updated(room.code, room),
              receipts = moved.receipts.updated(key,Receipt(action,room.id,room.code)))
            (updated, Right((room,seat)))
    }.flatMap(expose)

  def create(user: Identity, req: RequestId, mode: Mode, skin: Skin): IO[Either[RoomError,Json]] =
    IO((MatchId(UUID.randomUUID()), Vector.fill(12)(RoomCode.random()))).flatMap { case (id, codes) =>
      membership(user,req,Membership.Create(mode,skin)) { registry =>
        if registry.rooms.values.count(_.finished.isEmpty) >= 64 then Left(RoomError.Busy)
        else codes.find(!registry.rooms.contains(_)).toRight(RoomError.Busy).map { code =>
          val first = Seat.values.head
          val room = Room(id,code,mode,Engine.start(arena,mode),Map.empty,Map.empty,None,false)
          (room.enter(first,user,skin),first)
        }
      }
    }

  def join(user: Identity, req: RequestId, code: RoomCode, skin: Skin): IO[Either[RoomError,Json]] =
    membership(user,req,Membership.Join(code,skin)) { registry =>
      registry.rooms.get(code).toRight(RoomError.Missing).flatMap { room =>
        room.seatOf(user.player) match
          case Some(s) => Right((room,s))
          case None if room.finished.isDefined => Left(RoomError.Ended)
          case None =>
            val open = Seat.values.toVector.filterNot(room.pilots.contains)
            val previous = room.players.get(user.player).map(_.seat).filter(open.contains)
            previous.orElse(open.headOption).toRight(RoomError.Full).map(s => (room.enter(s,user,skin),s))
      }
    }

  private def access(user: Identity, code: RoomCode)(update: (Room,Seat,Pilot) => Pilot): IO[Either[RoomError,Json]] =
    data.modify { registry =>
      val found = for
        room <- registry.rooms.get(code).toRight(RoomError.Missing)
        s <- room.seatOf(user.player).toRight(RoomError.Forbidden)
      yield
        val pilot = update(room,s,room.pilots(s)).copy(seen = room.world.tick)
        (room.copy(pilots = room.pilots.updated(s,pilot)),s)
      val next = found.fold(_ => registry, (r,_) => registry.copy(rooms = registry.rooms.updated(code,r)))
      (next, found)
    }.flatMap(expose)

  def snapshot(user: Identity, code: RoomCode): IO[Either[RoomError,Json]] =
    access(user,code)((_,_,p) => p)
  def input(user: Identity, code: RoomCode, seq: InputSeq, intent: Controls): IO[Either[RoomError,Json]] =
    access(user,code) { (room,_,p) =>
      if seq.value <= p.ack then p
      else if room.finished.isDefined then p.copy(ack = seq.value)
      else p.copy(ack = seq.value, inputTick = room.world.tick, input = intent.withPending(p.input))
    }

  def leave(user: Identity, code: RoomCode): IO[Either[RoomError,Unit]] =
    data.modify { registry =>
      registry.rooms.get(code) match
        case None => (registry, Left(RoomError.Missing))
        case Some(room) if !room.players.contains(user.player) => (registry, Left(RoomError.Forbidden))
        case Some(room) => (registry.copy(rooms = registry.rooms.updated(code, room.leave(user.player))), Right(()))
    }

  private def advance: IO[Unit] = IO.realTimeInstant.flatMap(now => data.update(_.advance(arena,now)))
  private def flush: IO[Unit] = data.get.flatMap(_.rooms.values.toVector.filter(r => !r.stored && r.finished.isDefined).traverse_(store))
  def history(user: Identity): IO[Json] = flush *> results.history(user.player)

object Rooms:
  def start(arena: Arena, results: Results): Resource[IO,Rooms] =
    for
      ref <- Resource.eval(Ref.of[IO,Registry](Registry(Map.empty,Map.empty)))
      rooms = new Rooms(arena,ref,results)
      _ <- fs2.Stream.awakeEvery[IO](50.millis).evalMap(_ => rooms.advance).compile.drain.background
      _ <- fs2.Stream.awakeEvery[IO](1.second).evalMap(_ =>
        rooms.flush.handleErrorWith(e => IO.println(s"Score persistence retry: ${e.getClass.getSimpleName}"))).compile.drain.background
      _ <- Resource.onFinalize(rooms.flush)
    yield rooms

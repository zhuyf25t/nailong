package soda.parkour

import cats.effect.{IO, Ref, Resource}
import cats.effect.std.Mutex
import cats.syntax.all.*
import io.circe.Json
import scala.collection.immutable.Queue
import scala.concurrent.duration.*
import soda.identity.PlayerId

private[parkour] final case class Shift(id: RunId, world: World, ack: Long,
                                        held: Vec, actions: Queue[Action],
                                        inputAt: Long, seenAt: Long):
  def snapshot: Json = ParkourWire.snapshot(world, id.uuid.toString, ack)

  def submit(seq: InputSequence, sample: InputSample, pulse: Long): Either[ParkourProblem, Shift] =
    if seq.value <= ack then Right(copy(seenAt = pulse))
    else
      val accepted = copy(ack = seq.value, seenAt = pulse)
      sample.action match
        case Action.Idle => Right(accepted.copy(held = sample.movement, inputAt = pulse))
        case _ if actions.size >= 16 => Left(ParkourProblem.Busy)
        case action => Right(accepted.copy(held = sample.movement,
          actions = actions.enqueue(action), inputAt = pulse))

  def advance(pulse: Long): Shift =
    val (action, pending) = actions.dequeueOption.getOrElse((Action.Idle, Queue.empty))
    val movement = if pulse - inputAt <= 6 then held else Vec.zero
    copy(world = ParkourEngine.step(world, movement, action), actions = pending)

private final case class Shifts(active: Map[PlayerId, Shift], pulse: Long):
  def advance: Shifts =
    val nextPulse = pulse + 1
    val alive = active.view.filter { case (_, shift) => nextPulse - shift.seenAt <= 12000 }
      .mapValues(_.advance(nextPulse)).toMap
    Shifts(alive, nextPulse)

final class ParkourShifts private (ref: Ref[IO, Shifts], starts: Mutex[IO]):
  def start(player: PlayerId, request: StartId): IO[Either[ParkourProblem, Json]] =
    starts.lock.surround(IO.uncancelable { _ =>
      ref.modify { state =>
        val id = RunId.fresh()
        val shift = Shift(id, ParkourEngine.start(state.pulse), -1, Vec.zero, Queue.empty,
          state.pulse, state.pulse)
        (state.copy(active = state.active.updated(player, shift)),
          Right(ParkourWire.start(shift.world, id.uuid.toString)))
      }
    })

  private def access(player: PlayerId, id: RunId)
                    (update: (Shift, Long) => Either[ParkourProblem, Shift]): IO[Either[ParkourProblem, Json]] =
    ref.modify { state =>
      val result = state.active.get(player).filter(_.id == id).toRight(ParkourProblem.NotFound)
        .flatMap(shift => update(shift, state.pulse))
      val next = result.fold(_ => state, shift => state.copy(active = state.active.updated(player, shift)))
      (next, result.map(_.snapshot))
    }

  def get(player: PlayerId, id: RunId): IO[Either[ParkourProblem, Json]] =
    access(player, id)((shift, pulse) => Right(shift.copy(seenAt = pulse)))

  def input(player: PlayerId, id: RunId, seq: InputSequence, sample: InputSample)
  : IO[Either[ParkourProblem, Json]] =
    access(player, id)((shift, pulse) => shift.submit(seq, sample, pulse))

object ParkourShifts:
  def resource: Resource[IO, ParkourShifts] =
    for
      ref <- Resource.eval(Ref.of[IO, Shifts](Shifts(Map.empty, 0L)))
      mutex <- Resource.eval(Mutex[IO])
      service = new ParkourShifts(ref, mutex)
      _ <- fs2.Stream.awakeEvery[IO](50.millis).evalMap(_ => ref.update(_.advance)).compile.drain.background
    yield service

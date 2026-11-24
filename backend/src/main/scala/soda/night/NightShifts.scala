package soda.night

import cats.effect.{IO, Ref, Resource}
import cats.effect.std.Mutex
import cats.syntax.all.*
import io.circe.Json
import java.util.concurrent.ThreadLocalRandom
import scala.collection.immutable.Queue
import scala.concurrent.duration.*
import soda.identity.PlayerId

private[night] final case class Shift(id: RunId, world: NightWorld, ack: Long, held: NightInput,
                                     actions: Queue[NightInput], inputAt: Long, seenAt: Long, paused: Boolean = false):
  def snapshot: Json = NightWire.snapshot(world, id.uuid, ack, paused)
  def submit(seq: InputSequence, input: NightInput, pulse: Long): Either[NightProblem,Shift] =
    if seq.value <= ack then Right(copy(seenAt = pulse))
    else
      val accepted = copy(ack = seq.value, seenAt = pulse)
      input.action match
        case NightAction.Pause | NightAction.Resume =>
          val target = input.action == NightAction.Pause
          if target == paused then Right(accepted)
          else Right(accepted.copy(paused = target, held = NightInput.idle, actions = Queue.empty, inputAt = pulse))
        case _ if paused => Right(accepted)
        case NightAction.Idle | NightAction.Hold => Right(accepted.copy(held = input, inputAt = pulse))
        case _ if actions.size >= 16 => Left(NightProblem.Busy)
        case _ => Right(accepted.copy(held = input.withoutAction, actions = actions.enqueue(input), inputAt = pulse))

  def advance(pulse: Long): Shift =
    if paused then this
    else
      val (input, pending) = actions.dequeueOption.getOrElse(
        (if pulse - inputAt <= 6 then held else NightInput.idle, Queue.empty))
      val next = NightEngine.step(world, input)
      val changed = next.phase != world.phase || next.delivered != world.delivered ||
        next.puzzle.map(StoryPuzzles.inputScope) != world.puzzle.map(StoryPuzzles.inputScope)
      if changed then copy(world=next,actions=Queue.empty,held=held.withoutAction)
      else copy(world=next,actions=pending)

private final case class Shifts(active: Map[PlayerId,Shift], pending: Map[RunId,Clear], pulse: Long):
  def advance: Shifts =
    val nextPulse = pulse + 1
    val next = active.view.filter { case (_,shift) => nextPulse - shift.seenAt <= 12000 }
      .mapValues(_.advance(nextPulse)).toMap
    val finished = next.collect { case (player,shift)
      if shift.world.phase == NightPhase.Won && active(player).world.phase != NightPhase.Won =>
        shift.id -> Clear(player, shift.world.night, shift.world.clean,shift.world.firstNightTrace,shift.world.firstNightSounds)
    }
    Shifts(next, pending ++ finished, nextPulse)

final class NightShifts private (journal: NightJournal, ref: Ref[IO,Shifts], starts: Mutex[IO]):
  private def flush(player: Option[PlayerId]): IO[Unit] = ref.get.flatMap { current =>
    current.pending.toList.collect { case (id,done) if player.forall(_ == done.player) =>
      journal.record(done) *> ref.update(s => s.copy(pending = s.pending - id))
    }.sequence_
  }

  private def reply(player: PlayerId, result: Either[NightProblem,Shift]): IO[Either[NightProblem,Json]] =
    result match
      case Right(s) if s.world.phase == NightPhase.Won => flush(Some(player)).as(Right(s.snapshot))
      case other => IO.pure(other.map(_.snapshot))

  def profile(player: PlayerId): IO[NightProfile] = flush(Some(player)) *> journal.profile(player)

  def start(player: PlayerId, req: StartId, level: NightLevel): IO[Either[NightProblem,Json]] =
    starts.lock.surround(IO.uncancelable { _ =>
      for
        _ <- flush(Some(player))
        id <- IO(RunId.fresh())
        receipt <- journal.reserve(player, req, level, id)
        result <- receipt match
          case Left(problem) => IO.pure(Left(problem))
          case Right(Receipt(existing,false,_,_)) =>
            ref.get.map(_.active.get(player).filter(_.id == existing).toRight(NightProblem.Replaced))
          case Right(Receipt(fresh,true,trace,sounds)) =>
            IO(ThreadLocalRandom.current().nextLong()).flatMap { seed =>
              ref.modify { state =>
                val shift = Shift(fresh, NightEngine.start(level, seed,trace,sounds), -1, NightInput.idle, Queue.empty,
                  state.pulse, state.pulse)
                (state.copy(active = state.active.updated(player, shift)), Right(shift))
              }
            }
        answer <- reply(player,result)
      yield answer
    })

  private def access(player: PlayerId, id: RunId)
                    (update: (Shift,Long) => Either[NightProblem,Shift]): IO[Either[NightProblem,Json]] =
    ref.modify { state =>
      val result = state.active.get(player).filter(_.id == id).toRight(NightProblem.NotFound)
        .flatMap(shift => update(shift, state.pulse))
      val next = result.fold(_ => state, shift => state.copy(active = state.active.updated(player, shift)))
      (next,result)
    }.flatMap(reply(player,_))

  def get(player: PlayerId, id: RunId): IO[Either[NightProblem,Json]] =
    access(player,id)((s,pulse) => Right(s.copy(seenAt = pulse)))

  def input(player: PlayerId, id: RunId, seq: InputSequence, sample: NightInput): IO[Either[NightProblem,Json]] =
    access(player,id)((s,pulse) => s.submit(seq,sample,pulse))

object NightShifts:
  def resource(journal: NightJournal): Resource[IO,NightShifts] =
    for
      ref <- Resource.eval(Ref.of[IO,Shifts](Shifts(Map.empty, Map.empty, 0L)))
      mutex <- Resource.eval(Mutex[IO])
      service = new NightShifts(journal,ref,mutex)
      _ <- Resource.onFinalize(service.flush(None))
      _ <- fs2.Stream.awakeEvery[IO](50.millis).evalMap(_ => ref.update(_.advance)).compile.drain.background
      _ <- fs2.Stream.awakeEvery[IO](1.second).evalMap(_ => service.flush(None).handleErrorWith(e =>
        IO.println(s"Night save retry: ${e.getClass.getSimpleName}"))).compile.drain.background
    yield service

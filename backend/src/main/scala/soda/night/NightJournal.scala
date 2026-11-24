package soda.night

import cats.effect.IO
import cats.syntax.all.*
import io.circe.Json
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.Connection
import java.util.UUID
import scala.util.Using
import soda.identity.PlayerId
import soda.infrastructure.{Database, Sql}

final case class NightProfile(cleared: Vector[NightLevel], bestClean: Int):
  def unlocked: Int = (1 to 8).find(n => !cleared.exists(_.value == n)).getOrElse(8)
  def json: Json = Json.obj("unlocked" -> Json.fromInt(unlocked),
    "cleared" -> Json.fromValues(cleared.map(n => Json.fromInt(n.value))),
    "bestClean" -> Json.fromInt(bestClean))

private[night] final case class Receipt(id: RunId, fresh: Boolean, trace: Vector[NightPoint] = Vector.empty,
                                        sounds: Vector[EchoBeat] = Vector.empty)
private[night] final case class Clear(player: PlayerId, level: NightLevel, clean: Int, trace: Vector[NightPoint],
                                      sounds: Vector[EchoBeat])

final class NightJournal(db: Database):
  private def readProfile(conn: Connection, player: PlayerId): NightProfile =
    Sql.statement(conn, "SELECT night,best_clean FROM night_clears WHERE player_id=? ORDER BY night") { s =>
      s.setObject(1, player.value)
      Using.resource(s.executeQuery()) { rows =>
        val completed = Iterator.continually(rows.next()).takeWhile(identity).map { _ =>
          val night = NightLevel.from(rows.getInt(1)).getOrElse(throw new IllegalStateException("Invalid saved night"))
          (night, rows.getInt(2))
        }.toVector
        NightProfile(completed.map(_._1), completed.map(_._2).maxOption.getOrElse(0))
      }
    }

  def profile(player: PlayerId): IO[NightProfile] = db.transaction(readProfile(_, player))

  private[night] def reserve(player: PlayerId, req: StartId, night: NightLevel,
                             proposed: RunId): IO[Either[NightProblem,Receipt]] = db.transaction { conn =>
    // A durable receipt prevents a delayed retry from replacing a newer run, even after restart.
    Sql.statement(conn, "SELECT id FROM soda_players WHERE id=? FOR UPDATE") { s =>
      s.setObject(1, player.value)
      Sql.first(s)(_ => ())
    }
    val prior = Sql.statement(conn, "SELECT night,run_id FROM night_start_receipts WHERE player_id=? AND request_id=?") { s =>
      s.setObject(1, player.value)
      s.setObject(2, req.uuid)
      Sql.first(s)(r => (r.getInt(1), RunId.fromDatabase(r.getObject(2, classOf[UUID]))))
    }
    prior match
      case Some((existing,id)) if existing == night.value => Right(Receipt(id, fresh = false))
      case Some(_) => Left(NightProblem.Reused)
      case None if night.value > readProfile(conn, player).unlocked => Left(NightProblem.Locked)
      case None =>
        Sql.statement(conn, "INSERT INTO night_start_receipts(player_id,request_id,night,run_id) VALUES(?,?,?,?)") { s =>
          s.setObject(1, player.value)
          s.setObject(2, req.uuid)
          s.setInt(3, night.value)
          s.setObject(4, proposed.uuid)
          s.executeUpdate()
        }
        val fresh = Receipt(proposed, fresh = true)
        val receipt = if night.value == 1 then fresh else
          Sql.statement(conn,"SELECT points::text,sounds::text FROM night_first_trace WHERE player_id=?") { s =>
            s.setObject(1,player.value)
            Sql.first(s) { r =>
              val trace = if night.value != 6 then Vector.empty else
                decode[Vector[(Double,Double)]](r.getString(1)).fold(
                  _ => throw new IllegalStateException("Invalid night trace"),_.map((x,y) => NightPoint(x,y)))
              val sounds = Option(r.getString(2)).fold(Vector.empty[EchoBeat])(NightJournal.readSounds)
              fresh.copy(trace=trace,sounds=sounds)
            }.getOrElse(fresh)
          }
        Right(receipt)
  }

  private[night] def record(finish: Clear): IO[Unit] = db.transaction { conn =>
    Sql.statement(conn, """INSERT INTO night_clears(player_id,night,best_clean) VALUES (?,?,?)
        ON CONFLICT (player_id,night) DO UPDATE SET best_clean=GREATEST(night_clears.best_clean,EXCLUDED.best_clean)""") { s =>
      s.setObject(1, finish.player.value)
      s.setInt(2, finish.level.value)
      s.setInt(3, finish.clean)
      s.executeUpdate()
      ()
    }
    if finish.level.value == 1 then
      Sql.statement(conn,"""INSERT INTO night_first_trace(player_id,points,sounds) VALUES(?,?::jsonb,?::jsonb)
        ON CONFLICT(player_id) DO UPDATE SET points=EXCLUDED.points,sounds=EXCLUDED.sounds
        WHERE night_first_trace.sounds IS NULL AND EXCLUDED.sounds IS NOT NULL""") { s =>
        s.setObject(1,finish.player.value)
        s.setString(2,finish.trace.map(p => (p.x,p.y)).asJson.noSpaces)
        if finish.sounds.isEmpty then s.setNull(3,java.sql.Types.VARCHAR)
        else s.setString(3,finish.sounds.map(b => (b.kind.wire,b.gap)).asJson.noSpaces)
        s.executeUpdate()
      }
    ()
  }

object NightJournal:
  private[night] def readSounds(text: String): Vector[EchoBeat] =
    val decoded = decode[Vector[(String,Int)]](text).toOption.filter(_.size <= 3)
    decoded.flatMap(_.traverse { (name,gap) =>
      EchoKind.values.find(_.wire == name).filter(_ => gap >= 0).map(EchoBeat(_,gap))
    }).getOrElse(throw new IllegalStateException("Invalid recorded bottle sounds"))

  def initialize(conn: Connection): Unit =
    Sql.ddl(conn, """CREATE TABLE IF NOT EXISTS night_clears (
      player_id uuid NOT NULL REFERENCES soda_players(id), night smallint NOT NULL CHECK (night BETWEEN 1 AND 8),
      best_clean smallint NOT NULL CHECK (best_clean BETWEEN 0 AND 3), PRIMARY KEY(player_id,night))""")
    Sql.ddl(conn, """CREATE TABLE IF NOT EXISTS night_start_receipts (
      player_id uuid NOT NULL REFERENCES soda_players(id), request_id uuid NOT NULL, night smallint NOT NULL CHECK (night BETWEEN 1 AND 8),
      run_id uuid NOT NULL UNIQUE, PRIMARY KEY(player_id,request_id))""")
    Sql.ddl(conn,"""CREATE TABLE IF NOT EXISTS night_first_trace (
      player_id uuid PRIMARY KEY REFERENCES soda_players(id), points jsonb NOT NULL CHECK(jsonb_typeof(points)='array'))""")
    Sql.ddl(conn,"ALTER TABLE night_first_trace ADD COLUMN IF NOT EXISTS sounds jsonb CHECK(jsonb_typeof(sounds)='array')")

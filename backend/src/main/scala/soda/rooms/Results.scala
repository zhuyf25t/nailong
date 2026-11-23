package soda.rooms

import cats.effect.IO
import io.circe.Json
import java.sql.Connection
import java.time.OffsetDateTime
import scala.util.Using
import soda.identity.PlayerId
import soda.infrastructure.{Database, Sql}

final class Results(db: Database):
  def record(matchResult: Finished): IO[Unit] = db.transaction { c =>
    val fresh = Sql.statement(c, """INSERT INTO soda_matches(id,code,mode,ended_at) VALUES(?,?,?,?)
                    ON CONFLICT(id) DO NOTHING""") { s =>
      s.setObject(1, matchResult.id.value)
      s.setString(2, matchResult.code.value)
      s.setString(3, matchResult.mode.wire)
      s.setTimestamp(4, java.sql.Timestamp.from(matchResult.endedAt))
      s.executeUpdate() == 1
    }
    if fresh then Sql.statement(c, """INSERT INTO soda_standings(match_id,player_id,skin,score,outcome)
                 VALUES(?,?,?,?,?)""") { s =>
      matchResult.standings.foreach { standing =>
        s.setObject(1, matchResult.id.value)
        s.setObject(2, standing.player.value)
        s.setString(3, standing.skin.wire)
        s.setInt(4, standing.score)
        s.setString(5, standing.outcome.wire)
        s.addBatch()
      }
      s.executeBatch()
      ()
    }
  }

  def history(player: PlayerId): IO[Json] = db.transaction { c =>
    Sql.statement(c, """SELECT m.id,m.code,m.mode,s.skin,s.score,s.outcome,m.ended_at FROM soda_standings s
                JOIN soda_matches m ON m.id=s.match_id WHERE s.player_id=?
                ORDER BY m.ended_at DESC,m.id DESC LIMIT 20""") { s =>
      s.setObject(1, player.value)
      Using.resource(s.executeQuery()) { r =>
        val rows = Iterator.continually(r.next()).takeWhile(identity).map { _ =>
          Json.obj("matchId" -> Json.fromString(r.getString(1)), "code" -> Json.fromString(r.getString(2)),
            "mode" -> Json.fromString(r.getString(3)), "skin" -> Json.fromString(r.getString(4)),
            "score" -> Json.fromInt(r.getInt(5)), "outcome" -> Json.fromString(r.getString(6)),
            "endedAt" -> Json.fromString(r.getObject(7, classOf[OffsetDateTime]).toInstant.toString))
        }.toVector
        Json.obj("matches" -> Json.fromValues(rows))
      }
    }
  }

object Results:
  def initialize(c: Connection): Unit =
    Sql.ddl(c, """CREATE TABLE IF NOT EXISTS soda_matches(
      id uuid PRIMARY KEY, code text NOT NULL, mode text NOT NULL CHECK(mode IN ('ffa','ctf')), ended_at timestamptz NOT NULL)""")
    Sql.ddl(c, """CREATE TABLE IF NOT EXISTS soda_standings(
      match_id uuid NOT NULL REFERENCES soda_matches(id), player_id uuid NOT NULL REFERENCES soda_players(id),
      skin text NOT NULL CHECK(skin IN ('dragon','egg','frog')), score integer NOT NULL CHECK(score>=0),
      outcome text NOT NULL CHECK(outcome IN ('win','loss','draw')), PRIMARY KEY(match_id, player_id))""")
    Sql.ddl(c, "CREATE INDEX IF NOT EXISTS soda_standings_player ON soda_standings(player_id)")

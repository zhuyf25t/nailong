package services.player.tables.playersession

import cats.effect.IO
import services.player.objects.{PlayerId, SessionId, StoredSession}
import java.sql.{Connection, ResultSet, Timestamp}
import java.time.Instant
import java.util.UUID
import scala.util.Using

object PlayerSessionTable:
  private val insertSql = """
    INSERT INTO player_sessions (id, player_id, token_hash, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?)
  """
  def insert(connection: Connection, session: StoredSession): IO[StoredSession] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, session.id.value)
      statement.setObject(2, session.playerId.value)
      statement.setString(3, session.tokenHash)
      statement.setTimestamp(4, Timestamp.from(session.createdAt))
      statement.setTimestamp(5, Timestamp.from(session.expiresAt))
      statement.setTimestamp(6, session.revokedAt.map(Timestamp.from).orNull)
      statement.executeUpdate()
      session
    }
  }

  private val resolveSql = """
    SELECT id, player_id, token_hash, created_at, expires_at, revoked_at
    FROM player_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  """
  def resolve(connection: Connection, tokenHash: String, now: Instant): IO[Option[StoredSession]] = IO.blocking {
    Using.resource(connection.prepareStatement(resolveSql)) { statement =>
      statement.setString(1, tokenHash)
      statement.setTimestamp(2, Timestamp.from(now))
      Using.resource(statement.executeQuery()) { rows =>
        if rows.next() then Some(readSession(rows)) else None
      }
    }
  }

  private val revokeSql = """
    UPDATE player_sessions SET revoked_at = ?
    WHERE id = ? AND player_id = ? AND revoked_at IS NULL
  """
  def revoke(connection: Connection, id: SessionId, playerId: PlayerId, now: Instant): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(revokeSql)) { statement =>
      statement.setTimestamp(1, Timestamp.from(now))
      statement.setObject(2, id.value)
      statement.setObject(3, playerId.value)
      statement.executeUpdate()
      ()
    }
  }

  private def readSession(rows: ResultSet): StoredSession = StoredSession(
    SessionId(rows.getObject("id", classOf[UUID])),
    PlayerId(rows.getObject("player_id", classOf[UUID])),
    rows.getString("token_hash"),
    rows.getTimestamp("created_at").toInstant,
    rows.getTimestamp("expires_at").toInstant,
    Option(rows.getTimestamp("revoked_at")).map(_.toInstant)
  )

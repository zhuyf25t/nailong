package services.player.tables.player

import cats.effect.IO
import services.player.objects.{PlayerId, StoredPlayer}
import java.sql.{Connection, ResultSet, Timestamp}
import java.util.UUID
import scala.util.Using

object PlayerTable:
  private val insertSql = """
    INSERT INTO players (id, username, nickname, password_hash, password_salt, password_iterations, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  """
  def insert(connection: Connection, player: StoredPlayer): IO[StoredPlayer] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, player.id.value)
      statement.setString(2, player.username)
      statement.setString(3, player.nickname)
      statement.setString(4, player.passwordHash)
      statement.setString(5, player.passwordSalt)
      statement.setInt(6, player.passwordIterations)
      statement.setTimestamp(7, Timestamp.from(player.createdAt))
      statement.executeUpdate()
      player
    }
  }

  private val findByUsernameSql = """
    SELECT id, username, nickname, password_hash, password_salt, password_iterations, created_at
    FROM players WHERE username = ?
  """
  def findByUsername(connection: Connection, username: String): IO[Option[StoredPlayer]] = IO.blocking {
    Using.resource(connection.prepareStatement(findByUsernameSql)) { statement =>
      statement.setString(1, username)
      Using.resource(statement.executeQuery()) { rows =>
        if rows.next() then Some(readPlayer(rows)) else None
      }
    }
  }

  private val findByIdSql = """
    SELECT id, username, nickname, password_hash, password_salt, password_iterations, created_at
    FROM players WHERE id = ?
  """
  def findById(connection: Connection, id: PlayerId): IO[Option[StoredPlayer]] = IO.blocking {
    Using.resource(connection.prepareStatement(findByIdSql)) { statement =>
      statement.setObject(1, id.value)
      Using.resource(statement.executeQuery()) { rows =>
        if rows.next() then Some(readPlayer(rows)) else None
      }
    }
  }

  private def readPlayer(rows: ResultSet): StoredPlayer = StoredPlayer(
    PlayerId(rows.getObject("id", classOf[UUID])),
    rows.getString("username"),
    rows.getString("nickname"),
    rows.getString("password_hash"),
    rows.getString("password_salt"),
    rows.getInt("password_iterations"),
    rows.getTimestamp("created_at").toInstant
  )

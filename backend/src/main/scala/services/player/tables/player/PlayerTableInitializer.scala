package services.player.tables.player

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object PlayerTableInitializer:
  private val initializeSql = """
    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY,
      username VARCHAR(24) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
      nickname VARCHAR(24) NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 24),
      password_hash VARCHAR(64) NOT NULL CHECK (password_hash ~ '^[0-9a-f]{64}$'),
      password_salt VARCHAR(32) NOT NULL CHECK (password_salt ~ '^[0-9a-f]{32}$'),
      password_iterations INTEGER NOT NULL CHECK (password_iterations >= 210000),
      created_at TIMESTAMPTZ NOT NULL
    )
  """
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement =>
      statement.execute(initializeSql)
      ()
    }
  }

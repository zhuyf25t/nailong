package services.player.tables.playersession

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object PlayerSessionTableInitializer:
  private val initializeSql = """
    CREATE TABLE IF NOT EXISTS player_sessions (
      id UUID PRIMARY KEY,
      player_id UUID NOT NULL REFERENCES players(id),
      token_hash VARCHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
      revoked_at TIMESTAMPTZ NULL
    )
  """
  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- IO.blocking {
        Using.resource(connection.createStatement()) { statement =>
          statement.execute(initializeSql)
          ()
        }
      }
      _ <- initializeIndex(connection)
    yield ()

  private val initializeIndexSql = "CREATE INDEX IF NOT EXISTS player_sessions_player_id_idx ON player_sessions(player_id)"
  private def initializeIndex(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement =>
      statement.execute(initializeIndexSql)
      ()
    }
  }

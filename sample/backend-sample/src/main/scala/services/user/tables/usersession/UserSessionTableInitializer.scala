package services.user.tables.usersession

import cats.effect.IO

import java.sql.Connection

object UserSessionTableInitializer:

  private val initTableSql: String =
    """
      |create table if not exists library_user_sessions (
      |  token_hash varchar(128) primary key,
      |  user_id uuid not null references library_users(id) on delete cascade,
      |  expires_at timestamptz not null,
      |  created_at timestamptz not null
      |);
      |
      |create index if not exists library_user_sessions_user_id_idx on library_user_sessions(user_id);
      |create index if not exists library_user_sessions_expires_at_idx on library_user_sessions(expires_at);
      |""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    IO.blocking {
      val statement = connection.createStatement()
      try statement.execute(initTableSql)
      finally statement.close()
    }

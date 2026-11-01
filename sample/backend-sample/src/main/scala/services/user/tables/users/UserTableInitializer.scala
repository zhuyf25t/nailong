package services.user.tables.users

import cats.effect.IO

import java.sql.Connection

object UserTableInitializer:

  private val initTableSql: String =
    """
      |create table if not exists library_users (
      |  id uuid primary key,
      |  username varchar(80) unique not null,
      |  password_hash varchar(256) not null,
      |  password_salt varchar(128) not null,
      |  role varchar(24) not null check (role in ('admin', 'reader')),
      |  created_at timestamptz not null
      |);
      |""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    IO.blocking {
      val statement = connection.createStatement()
      try statement.execute(initTableSql)
      finally statement.close()
    }

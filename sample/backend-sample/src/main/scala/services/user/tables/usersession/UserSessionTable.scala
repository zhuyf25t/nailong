package services.user.tables.usersession

import cats.effect.IO
import services.user.objects.{StoredUser, UserId, UserRole}

import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.Instant

object UserSessionTable:

  private val insertSessionSql: String =
    """
      |insert into library_user_sessions (token_hash, user_id, expires_at, created_at)
      |values (?, ?, ?, ?)
      |""".stripMargin

  private[user] def insert(
    connection: Connection,
    tokenHash: String,
    userId: UserId,
    expiresAt: Instant
  ): IO[Unit] =
    IO.blocking {
      val statement = connection.prepareStatement(insertSessionSql)
      try
        statement.setString(1, tokenHash)
        statement.setObject(2, userId.value)
        statement.setTimestamp(3, Timestamp.from(expiresAt))
        statement.setTimestamp(4, Timestamp.from(Instant.now()))
        statement.executeUpdate()
        ()
      finally statement.close()
    }

  private val findUserBySessionSql: String =
    """
      |select u.id, u.username, u.password_hash, u.password_salt, u.role, u.created_at
      |from library_user_sessions s
      |join library_users u on u.id = s.user_id
      |where s.token_hash = ?
      |  and s.expires_at > now()
      |""".stripMargin

  private[user] def findUserByTokenHash(connection: Connection, tokenHash: String): IO[Option[StoredUser]] =
    queryOne(connection.prepareStatement(findUserBySessionSql)) { statement =>
      statement.setString(1, tokenHash)
    }

  private val deleteSessionSql: String =
    """
      |delete from library_user_sessions
      |where token_hash = ?
      |""".stripMargin

  private[user] def delete(connection: Connection, tokenHash: String): IO[Unit] =
    IO.blocking {
      val statement = connection.prepareStatement(deleteSessionSql)
      try
        statement.setString(1, tokenHash)
        statement.executeUpdate()
        ()
      finally statement.close()
    }

  private val deleteSessionsByUserIdSql: String =
    """
      |delete from library_user_sessions
      |where user_id = ?
      |""".stripMargin

  private[user] def deleteByUserId(connection: Connection, userId: UserId): IO[Unit] =
    IO.blocking {
      val statement = connection.prepareStatement(deleteSessionsByUserIdSql)
      try
        statement.setObject(1, userId.value)
        statement.executeUpdate()
        ()
      finally statement.close()
    }

  private val deleteExpiredSessionsSql: String =
    """
      |delete from library_user_sessions
      |where expires_at <= now()
      |""".stripMargin

  private[user] def deleteExpired(connection: Connection): IO[Unit] =
    IO.blocking {
      val statement = connection.prepareStatement(deleteExpiredSessionsSql)
      try
        statement.executeUpdate()
        ()
      finally statement.close()
    }

  private def queryOne(statement: PreparedStatement)(bind: PreparedStatement => Unit): IO[Option[StoredUser]] =
    IO.blocking {
      try
        bind(statement)
        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then Some(readStoredUser(resultSet))
          else None
        finally resultSet.close()
      finally statement.close()
    }

  private def readStoredUser(resultSet: ResultSet): StoredUser =
    StoredUser(
      id = UserId(resultSet.getObject("id", classOf[java.util.UUID])),
      username = resultSet.getString("username"),
      passwordHash = resultSet.getString("password_hash"),
      passwordSalt = resultSet.getString("password_salt"),
      role = UserRole.fromString(resultSet.getString("role")).fold(
        message => throw new IllegalArgumentException(message),
        identity
      ),
      createdAt = resultSet.getTimestamp("created_at").toInstant
    )

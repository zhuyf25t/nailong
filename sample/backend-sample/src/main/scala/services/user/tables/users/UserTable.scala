package services.user.tables.users

import cats.effect.IO
import services.user.objects.{StoredUser, UserId, UserRole}

import java.sql.{Connection, PreparedStatement, ResultSet, Timestamp}
import java.time.Instant
import java.util.UUID

object UserTable:

  private val insertUserSql: String =
    """
      |insert into library_users (id, username, password_hash, password_salt, role, created_at)
      |values (?, ?, ?, ?, ?, ?)
      |returning id, username, password_hash, password_salt, role, created_at
      |""".stripMargin

  private[user] def insert(
    connection: Connection,
    username: String,
    passwordHash: String,
    passwordSalt: String,
    role: UserRole
  ): IO[StoredUser] =
    IO.blocking {
      val statement = connection.prepareStatement(insertUserSql)
      try
        val now = Instant.now()
        statement.setObject(1, UUID.randomUUID())
        statement.setString(2, username)
        statement.setString(3, passwordHash)
        statement.setString(4, passwordSalt)
        statement.setString(5, UserRole.toString(role))
        statement.setTimestamp(6, Timestamp.from(now))

        val resultSet = statement.executeQuery()
        try
          if resultSet.next() then readStoredUser(resultSet)
          else throw new IllegalStateException("User insert returned no row")
        finally resultSet.close()
      finally statement.close()
    }

  private val findByUsernameSql: String =
    """
      |select id, username, password_hash, password_salt, role, created_at
      |from library_users
      |where username = ?
      |""".stripMargin

  private[user] def findByUsername(connection: Connection, username: String): IO[Option[StoredUser]] =
    queryOne(connection.prepareStatement(findByUsernameSql)) { statement =>
      statement.setString(1, username)
    }

  private val findByIdSql: String =
    """
      |select id, username, password_hash, password_salt, role, created_at
      |from library_users
      |where id = ?
      |""".stripMargin

  private[user] def findById(connection: Connection, userId: UserId): IO[Option[StoredUser]] =
    queryOne(connection.prepareStatement(findByIdSql)) { statement =>
      statement.setObject(1, userId.value)
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

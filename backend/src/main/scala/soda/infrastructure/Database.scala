package soda.infrastructure

import cats.effect.{IO, Resource}
import com.zaxxer.hikari.{HikariConfig, HikariDataSource}
import java.sql.{Connection, PreparedStatement, ResultSet}
import scala.util.Using
import scala.util.control.NonFatal

final class Database private (pool: HikariDataSource):
  def transaction[A](run: Connection => A): IO[A] = IO.blocking {
    Using.resource(pool.getConnection) { conn =>
      conn.setAutoCommit(false)
      try
        val result = run(conn)
        conn.commit()
        result
      catch
        case NonFatal(failure) =>
          conn.rollback()
          throw failure
    }
  }

object Database:
  def resource: Resource[IO, Database] = Resource.fromAutoCloseable(IO.blocking {
    val cfg = new HikariConfig()
    cfg.setJdbcUrl(sys.env.getOrElse("SODA_JDBC_URL", "jdbc:postgresql://127.0.0.1:55439/postgres"))
    cfg.setUsername(sys.env.getOrElse("SODA_DB_USER", "soda"))
    cfg.setPassword(sys.env("SODA_DB_PASSWORD"))
    cfg.setMaximumPoolSize(5)
    cfg.setConnectionTimeout(5000)
    new HikariDataSource(cfg)
  }).map(new Database(_))

object Sql:
  def statement[A](c: Connection, sql: String)(f: PreparedStatement => A): A =
    Using.resource(c.prepareStatement(sql))(f)
  def first[A](s: PreparedStatement)(f: ResultSet => A): Option[A] =
    Using.resource(s.executeQuery())(rows => Option.when(rows.next())(f(rows)))
  def ddl(c: Connection, sql: String): Unit =
    Using.resource(c.createStatement())(_.execute(sql))
    ()

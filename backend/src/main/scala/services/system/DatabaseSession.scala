package services.system

import cats.effect.{IO, Resource}
import com.zaxxer.hikari.{HikariConfig, HikariDataSource}
import java.sql.Connection
import services.system.objects.DatabaseConfig

/** Each HTTP operation owns a connection and a transaction. Nested plans reuse that connection. */
final class DatabaseSession private (dataSource: HikariDataSource):
  def transaction[A](operation: Connection => IO[A]): IO[A] =
    Resource.make(IO.blocking(dataSource.getConnection))(connection => IO.blocking(connection.close())).use { connection =>
      IO.uncancelable { poll =>
        val rollback = IO.blocking(connection.rollback()).handleErrorWith(_ => IO.unit)
        IO.blocking(connection.setAutoCommit(false)) *>
          poll(IO.defer(operation(connection))).onCancel(rollback).attempt.flatMap {
            case Right(result) => IO.blocking(connection.commit()).onError(_ => rollback).as(result)
            case Left(error) => rollback *> IO.raiseError(error)
          }
      }
    }

object DatabaseSession:
  def resource(config: DatabaseConfig): Resource[IO, DatabaseSession] =
    Resource.make(IO.blocking {
      val pool = new HikariConfig()
      pool.setJdbcUrl(config.jdbcUrl)
      pool.setUsername(config.user)
      pool.setPassword(config.password)
      pool.setMaximumPoolSize(config.maxPoolSize)
      pool.setConnectionTimeout(10000L)
      pool.setPoolName("nailong-postgres")
      new HikariDataSource(pool)
    })(pool => IO.blocking(pool.close())).map(new DatabaseSession(_))

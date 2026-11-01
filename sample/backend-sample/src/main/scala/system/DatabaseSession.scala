package system

import cats.effect.{IO, Resource}
import com.zaxxer.hikari.{HikariConfig, HikariDataSource}
import org.typelevel.log4cats.slf4j.Slf4jLogger

import java.sql.Connection
import java.util.concurrent.atomic.AtomicReference

object DatabaseSession:

  private val logger = Slf4jLogger.getLogger[IO]
  private val config = DatabaseConfig.default
  private val dataSourceRef = AtomicReference[Option[HikariDataSource]](None)

  def initialize: Resource[IO, Unit] =
    for
      dataSource <- Resource.make(createDataSource)(closeDataSource)
      _ <- Resource.make(register(dataSource))(_ => clearRegistration)
    yield ()

  private def createDataSource: IO[HikariDataSource] =
    IO.blocking {
      Class.forName("org.postgresql.Driver")
      val hikariConfig = HikariConfig()
      hikariConfig.setJdbcUrl(config.url)
      hikariConfig.setUsername(config.user)
      hikariConfig.setPassword(config.password)
      hikariConfig.setMaximumPoolSize(config.maxPoolSize)
      hikariConfig.setConnectionTimeout(config.connectionTimeoutMs)
      hikariConfig.setPoolName("library-system-pool")
      new HikariDataSource(hikariConfig)
    }.flatTap(_ =>
      logger.info(
        s"Initialized PostgreSQL connection pool, host=${config.host}, port=${config.port}, database=${config.databaseName}, maxPoolSize=${config.maxPoolSize}"
      )
    )

  private def closeDataSource(dataSource: HikariDataSource): IO[Unit] =
    IO.blocking(dataSource.close()).handleErrorWith(_ => IO.unit)

  private def register(dataSource: HikariDataSource): IO[Unit] =
    IO {
      dataSourceRef.set(Some(dataSource))
    }

  private def clearRegistration: IO[Unit] =
    IO {
      dataSourceRef.set(None)
    }

  private def dataSourceOrFail: IO[HikariDataSource] =
    IO.fromOption(dataSourceRef.get())(
      new IllegalStateException("DatabaseSession is not initialized")
    )

  private def pooledConnectionResource: Resource[IO, Connection] =
    Resource.make {
      dataSourceOrFail.flatMap(dataSource =>
        IO.blocking(dataSource.getConnection)
      )
    } { connection =>
      IO.blocking(connection.close()).handleErrorWith(_ => IO.unit)
    }

  def withTransactionConnection[A](operation: Connection => IO[A]): IO[A] =
    pooledConnectionResource.use { connection =>
      for
        _ <- IO.blocking(connection.setAutoCommit(false))
        result <- operation(connection).attempt
        _ <- result match
          case Right(_) => IO.blocking(connection.commit())
          case Left(_) => IO.blocking(connection.rollback()).handleErrorWith(_ => IO.unit)
        value <- IO.fromEither(result)
      yield value
    }

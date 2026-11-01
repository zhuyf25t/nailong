package system

import java.nio.file.Paths

final case class DatabaseConfig(
  host: String,
  port: Int,
  databaseName: String,
  user: String,
  password: String,
  maxPoolSize: Int,
  connectionTimeoutMs: Long
)

object DatabaseConfig:

  private def defaultDatabaseName: String =
    sys.env
      .get("DB_NAME")
      .orElse {
        Option(Paths.get(sys.props.getOrElse("user.dir", ".")).getFileName)
          .map(_.toString.replace('-', '_'))
      }
      .getOrElse(SystemDefaults.DefaultDatabaseName)

  extension (config: DatabaseConfig)
    def url: String =
      s"jdbc:postgresql://${config.host}:${config.port}/${config.databaseName}"

  val default: DatabaseConfig =
    DatabaseConfig(
      host = sys.env.getOrElse("DB_HOST", "127.0.0.1"),
      port = sys.env.get("DB_PORT").flatMap(_.toIntOption).getOrElse(5432),
      databaseName = defaultDatabaseName,
      user = sys.env.getOrElse("DB_USER", "db"),
      password = sys.env.getOrElse("DB_PASSWORD", "root"),
      maxPoolSize = sys.env.get("DB_MAX_POOL_SIZE").flatMap(_.toIntOption).getOrElse(10),
      connectionTimeoutMs = sys.env.get("DB_CONNECTION_TIMEOUT_MS").flatMap(_.toLongOption).getOrElse(3000L)
    )

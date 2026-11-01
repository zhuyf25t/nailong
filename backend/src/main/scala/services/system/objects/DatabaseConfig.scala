package services.system.objects

final case class DatabaseConfig(host: String, port: Int, databaseName: String, user: String, password: String, maxPoolSize: Int = 8):
  def jdbcUrl: String = s"jdbc:postgresql://$host:$port/$databaseName"

object DatabaseConfig:
  def fromEnvironment: DatabaseConfig =
    DatabaseConfig(
      sys.env.getOrElse("DB_HOST", "127.0.0.1"),
      sys.env.get("DB_PORT").fold(5432)(_.toInt),
      sys.env.getOrElse("DB_NAME", "nailong"),
      sys.env.getOrElse("DB_USER", "nailong"),
      sys.env.getOrElse("DB_PASSWORD", throw new IllegalArgumentException("DB_PASSWORD is required; load the project .env.")),
      sys.env.get("DB_MAX_POOL_SIZE").fold(8)(_.toInt)
    )

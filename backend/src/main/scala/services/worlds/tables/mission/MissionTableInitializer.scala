package services.worlds.tables.mission
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
object MissionTableInitializer:
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement =>
      statement.execute("create table if not exists world_missions(id text not null,version text not null,definition_json jsonb not null, primary key(id,version))")
      ()
    }
  }

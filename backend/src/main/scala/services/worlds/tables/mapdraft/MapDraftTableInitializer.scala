package services.worlds.tables.mapdraft
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
object MapDraftTableInitializer:
  private val sql = """create table if not exists world_maps (
    id uuid primary key, owner_id uuid references players(id), title text not null,
    revision integer not null check(revision >= 0), world_json jsonb not null,
    updated_at timestamptz not null, built_in boolean not null,
    check ((built_in and owner_id is null) or (not built_in and owner_id is not null)))"""
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement =>
      statement.execute(sql)
      statement.execute("create index if not exists world_maps_owner_updated on world_maps(owner_id, updated_at desc, id)")
      ()
    }
  }

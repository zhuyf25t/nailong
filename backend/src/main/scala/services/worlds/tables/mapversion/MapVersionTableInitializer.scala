package services.worlds.tables.mapversion
import cats.effect.IO
import java.sql.Connection
import scala.util.Using
object MapVersionTableInitializer:
  private val sql = """create table if not exists world_map_versions (
    id uuid primary key, map_id uuid not null references world_maps(id),
    version integer not null check(version > 0), source_revision integer not null check(source_revision >= 0),
    title text not null, world_json jsonb not null, created_at timestamptz not null,
    unique(map_id,version), unique(map_id,source_revision))"""
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.createStatement()) { statement => statement.execute(sql); () }
  }

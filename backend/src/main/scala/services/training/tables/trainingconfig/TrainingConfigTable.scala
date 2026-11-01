package services.training.tables.trainingconfig

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.Connection
import scala.util.Using
import services.training.objects.{TrainingConfig, TrainingConfigId}
import services.training.utils.TrainingConfigResource

/** Immutable versioned rules. There is deliberately no update operation. */
object TrainingConfigTable:
  private val insertIfAbsentSql =
    "insert into training_configs (id, version, config_json) values (?, ?, ?::jsonb) on conflict (id, version) do nothing"

  def insertIfAbsent(connection: Connection, config: TrainingConfig): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(insertIfAbsentSql)) { statement =>
      statement.setObject(1, config.id.value)
      statement.setString(2, config.version)
      statement.setString(3, config.asJson.noSpaces)
      statement.executeUpdate()
      ()
    }
  }

  private val findSql = "select config_json from training_configs where id = ? and version = ?"

  def find(connection: Connection, id: TrainingConfigId, version: String): IO[Option[TrainingConfig]] = IO.blocking {
    Using.resource(connection.prepareStatement(findSql)) { statement =>
      statement.setObject(1, id.value)
      statement.setString(2, version)
      Using.resource(statement.executeQuery()) { rows =>
        Option.when(rows.next()) {
          decode[TrainingConfig](rows.getString("config_json"))
            .fold(error => throw new IllegalStateException("Stored training configuration is invalid", error), identity)
        }
      }
    }
  }

  /** The bundled version selects the active rules, while historical versions stay readable. */
  def current(connection: Connection): IO[TrainingConfig] =
    for
      bundled <- TrainingConfigResource.load()
      stored <- find(connection, bundled.id, bundled.version)
      config <- IO.fromOption(stored)(new IllegalStateException("Current training configuration was not initialized"))
      _ <- IO.raiseWhen(config != bundled)(new IllegalStateException("An immutable training version differs from the bundled configuration; publish a new version"))
    yield config

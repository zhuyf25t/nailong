package services.training.utils

import cats.effect.IO
import io.circe.parser.decode
import java.nio.charset.StandardCharsets
import scala.util.Using
import services.training.objects.TrainingConfig

object TrainingConfigResource:
  /** Reading and validating configuration is startup/request IO, never an object constructor side effect. */
  private[training] def load(): IO[TrainingConfig] =
    IO.blocking {
      val stream = Option(getClass.getResourceAsStream("/game-config.json"))
        .getOrElse(throw new IllegalStateException("Missing game-config.json"))
      Using.resource(stream)(input => new String(input.readAllBytes(), StandardCharsets.UTF_8))
    }.flatMap(text => IO.fromEither(decode[TrainingConfig](text)))
      .flatTap(validate)

  /** The same documented numeric domain applies to bundled rules and future versions. */
  private[training] def validate(config: TrainingConfig): IO[Unit] =
    ValidateTerrain(config.terrain) *> IO {
      val drones = config.drones
      val weapon = config.weapon
      val ranges = List(
        ("scanRange", drones.scanRange, 1.0, 100.0),
        ("scanFovDegrees", drones.scanFovDegrees, 10.0, 360.0),
        ("scanSpeed", drones.scanSpeed, 0.0, 100.0),
        ("alertSpeed", drones.alertSpeed, 0.0, 100.0),
        ("alertSeconds", drones.alertSeconds, 0.0, 60.0),
        ("hitScanSeconds", drones.hitScanSeconds, 0.0, 60.0),
        ("lostSightSeconds", drones.lostSightSeconds, 0.0, 60.0),
        ("spawnGraceSeconds", drones.spawnGraceSeconds, 0.0, 60.0),
        ("patrolSpeed", drones.patrolSpeed, 0.0, 20.0),
        ("chaseSpeed", drones.chaseSpeed, 0.0, 20.0),
        ("patrolRadius", drones.patrolRadius, 0.0, 50.0),
        ("contactRadius", drones.contactRadius, 0.1, 5.0),
        ("projectileSpeed", weapon.projectileSpeed, 1.0, 100.0),
        ("projectileRange", weapon.projectileRange, 1.0, 100.0)
      )
      require(config.version.nonEmpty && config.title.nonEmpty, "Configuration metadata cannot be empty")
      require(drones.maxHp >= 1 && drones.maxHp <= 20, "maxHp must be between 1 and 20")
      require(drones.spawns.nonEmpty && drones.spawns.size <= 32, "spawns must contain 1 to 32 entries")
      require(weapon.fireIntervalMs >= 100 && weapon.fireIntervalMs <= 5000, "fireIntervalMs must be between 100 and 5000")
      ranges.foreach { case (name, value, min, max) =>
        require(value.isFinite && value >= min && value <= max, s"$name must be finite and between $min and $max")
      }
      drones.spawns.foreach { spawn =>
        require(spawn.x.isFinite && spawn.x >= -80 && spawn.x <= 80, "spawn.x must be between -80 and 80")
        require(spawn.z.isFinite && spawn.z >= -80 && spawn.z <= 80, "spawn.z must be between -80 and 80")
        require(spawn.yaw.isFinite, "spawn.yaw must be finite")
      }
    }

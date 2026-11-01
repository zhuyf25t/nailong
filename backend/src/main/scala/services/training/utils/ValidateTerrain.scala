package services.training.utils

import cats.effect.IO
import services.system.objects.HttpError
import services.training.objects.TerrainConfig

object ValidateTerrain:
  private[training] def apply(terrain: TerrainConfig): IO[Unit] = IO {
    val fields = List(
      ("hillHeight", terrain.hillHeight, 0.0, 4.0),
      ("hillWidth", terrain.hillWidth, 2.5, 9.0),
      ("hillX", terrain.hillX, -8.0, 8.0),
      ("hillZ", terrain.hillZ, -8.0, 8.0),
      ("ripple", terrain.ripple, 0.0, 0.8)
    )
    fields.find { case (_, value, min, max) => !value.isFinite || value < min || value > max }
      .foreach { case (name, _, min, max) => throw HttpError.validation(s"$name 必须在 $min 到 $max 之间。") }
  }

package services.training.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class TrainingConfig(
  id: TrainingConfigId,
  version: String,
  title: String,
  terrain: TerrainConfig,
  drones: DroneRules,
  weapon: WeaponConfig
)

object TrainingConfig:
  given Encoder[TrainingConfig] = deriveEncoder[TrainingConfig]
  given Decoder[TrainingConfig] = deriveDecoder[TrainingConfig]

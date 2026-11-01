package services.training.objects

import io.circe.{Decoder, DecodingFailure, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.objects.{MapVersionId, MissionDefinition, WorldDefinition}

/** Immutable server-selected world/rules snapshot. Seed shares the frontend's nonnegative Int range. */
final case class RunSetup(
  mission: MissionDefinition,
  world: WorldDefinition,
  mapVersionId: MapVersionId,
  loadout: Loadout,
  seed: Long,
  assetVersion: String
)

object RunSetup:
  private given Decoder[Long] = Decoder.instance { cursor =>
    cursor.value.asNumber.flatMap(_.toLong).filter(value => value >= 0 && value <= Int.MaxValue.toLong)
      .toRight(DecodingFailure("seed 必须是 0 到 2147483647 之间的 JSON 整数", cursor.history))
  }
  given Encoder[RunSetup] = deriveEncoder[RunSetup]
  given Decoder[RunSetup] = deriveDecoder[RunSetup]

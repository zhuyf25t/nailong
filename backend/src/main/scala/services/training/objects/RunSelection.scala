package services.training.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.objects.{MapVersionId, MissionId}

/** The original request selection is persisted separately from its resolved setup for idempotency. */
final case class RunSelection(missionId: MissionId, mapVersionId: Option[MapVersionId], loadout: Loadout)

object RunSelection:
  given Encoder[RunSelection] = deriveEncoder[RunSelection]
  given Decoder[RunSelection] = deriveDecoder[RunSelection]

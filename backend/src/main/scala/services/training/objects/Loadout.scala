package services.training.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.worlds.objects.ToolKind

final case class Loadout(tool: ToolKind)

object Loadout:
  given Encoder[Loadout] = deriveEncoder[Loadout]
  given Decoder[Loadout] = deriveDecoder[Loadout]

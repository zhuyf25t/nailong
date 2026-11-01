package services.records.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class ObjectiveProgress(beaconActivated: Boolean, extracted: Boolean)

object ObjectiveProgress:
  given Encoder[ObjectiveProgress] = deriveEncoder[ObjectiveProgress]
  given Decoder[ObjectiveProgress] = deriveDecoder[ObjectiveProgress]

package services.worlds.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.training.objects.TerrainConfig
import services.worlds.utils.WorldWireCodecs.given
final case class WorldDefinition(schemaVersion: Int, title: String, terrain: TerrainConfig, bounds: WorldBounds,
  spawn: WorldSpawn, objects: List[WorldObject], drones: List[WorldDrone], beacon: WorldMarker, extraction: WorldMarker)
object WorldDefinition:
  given Encoder[WorldDefinition] = deriveEncoder[WorldDefinition]
  given Decoder[WorldDefinition] = deriveDecoder[WorldDefinition]

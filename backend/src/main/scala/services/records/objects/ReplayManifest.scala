package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given
import services.training.objects.{RunId, TrainingConfig}
import services.worlds.objects.{WorldDefinition, MapVersionId}
final case class ReplayManifest(formatVersion: Int, runId: Option[RunId], config: TrainingConfig, world: WorldDefinition, mapVersionId: Option[MapVersionId], missionId: String, assetVersion: String, sampleHz: Int, coverage: ReplayCoverage)
object ReplayManifest:
  given Encoder[ReplayManifest] = deriveEncoder[ReplayManifest]
  given Decoder[ReplayManifest] = deriveDecoder[ReplayManifest]

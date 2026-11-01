package services.records.objects
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.records.utils.RecordingCodecs.given

final case class ReplayFrame(tMs: Long, scoreElapsedMs: Long, throughEventSeq: Int, player: ReplayPlayerState, drones: List[ReplayDroneState], projectiles: List[ReplayProjectileState], tools: List[ReplayToolState], world: ReplayWorldState, camera: ReplayCameraState)
object ReplayFrame:
  given Encoder[ReplayFrame] = deriveEncoder[ReplayFrame]
  given Decoder[ReplayFrame] = deriveDecoder[ReplayFrame]

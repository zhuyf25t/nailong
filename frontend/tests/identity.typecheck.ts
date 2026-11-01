import type { PlayerId } from '../src/objects/player/PlayerId.ts';
import type { RunId } from '../src/objects/training/RunId.ts';
import type { TrainingConfigId } from '../src/objects/training/TrainingConfigId.ts';
import type { SessionToken } from '../src/objects/system/SessionToken.ts';
import { GetTrainingRunAPI } from '../src/apis/training/GetTrainingRunAPI.ts';
import { StartTrainingRunAPI } from '../src/apis/training/StartTrainingRunAPI.ts';
import type { TerrainConfig } from '../src/objects/training/TerrainConfig.ts';

// Included in tsc --noEmit. Removing any nominal brand makes @ts-expect-error fail.
export function identityCompileEvidence(player: PlayerId, run: RunId, config: TrainingConfigId, token: SessionToken, terrain: TerrainConfig) {
  new GetTrainingRunAPI(run);
  new StartTrainingRunAPI(crypto.randomUUID(),config,'drone-hunt-v2',terrain);
  // @ts-expect-error A PlayerId cannot be used where RunId is required.
  new GetTrainingRunAPI(player);
  // @ts-expect-error A RunId cannot be used as TrainingConfigId.
  new StartTrainingRunAPI(crypto.randomUUID(),run,'drone-hunt-v2',terrain);
  // @ts-expect-error A token is not a player ID.
  const wrongPlayer: PlayerId = token;
  // @ts-expect-error Raw URL strings must be parsed before becoming a RunId.
  new GetTrainingRunAPI('22222222-2222-4222-8222-222222222222');
  return wrongPlayer;
}

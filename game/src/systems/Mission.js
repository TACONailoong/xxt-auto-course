import { MISSION_STAGES } from '../core/constants.js';
import { sound } from '../audio/SoundManager.js';

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.stageIndex = 0;
  }

  get stage() {
    return MISSION_STAGES[Math.min(this.stageIndex, MISSION_STAGES.length - 1)];
  }

  update() {
    const stage = this.stage;
    if (!stage || stage.id === 'free') return;
    if (stage.check(this.game)) {
      stage.onComplete(this.game);
      sound.missionComplete();
      this.stageIndex++;
      this.game.ui.refreshMission();
    }
  }

  forceProgress() {
    this.stageIndex = Math.min(this.stageIndex + 1, MISSION_STAGES.length - 1);
  }
}

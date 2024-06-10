const assert = require("node:assert");

const _gamificationConfig = require(
  process.env.GAMIFICATION_CONFIG_PATH ?? "../../config/gamification.json",
);

/**
 * @typedef {Object} Level
 * @property {number} xp minimum XP, inclusive
 * @property {number} maxXp maximum XP, exclusive
 * @property {number} id
 */

class _LevelsConfig {
  constructor(levelsConfig) {
    /** @type {Level[]} */
    this.levels = [
      {
        xp: 0,
        maxXp: +Infinity,
        id: 0,
      },
    ];

    for (const levelConfig of levelsConfig) {
      const prev = this.levels[this.levels.length - 1];

      if (levelConfig.xp <= prev.xp) {
        assert.fail(
          `Level ${this.levels.length} xp threshold should be greater than xp threshold (${prev.xp}) of previous level but is set to ${levelConfig.xp}`,
        );
      }

      this.levels.push({
        xp: levelConfig.xp,
        id: this.levels.length,
        maxXp: +Infinity,
      });

      prev.maxXp = levelConfig.xp;
    }
  }

  getLevelByXp(xp) {
    for (const level of this.levels) {
      if (level.maxXp > xp) {
        return level.id;
      }
    }

    assert.fail("unreachable");
  }
}

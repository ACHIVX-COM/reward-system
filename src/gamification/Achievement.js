const assert = require("node:assert");

/** @abstract */
module.exports = class Achievement {
  /** @type {string} */
  static typeName = "<unknown>";

  constructor({
    name,
    maxProgress = 1,
    trackedActions = [],
    config: { xp: experience = 0, reward = 0 } = {},
  }) {
    /** @type {string} */
    this.name = name;
    /** @type {Set<string>} */
    this.trackedActions = new Set(trackedActions);

    assert.ok(
      typeof maxProgress === "number" &&
        Number.isSafeInteger(maxProgress) &&
        maxProgress > 0,
      "Achievements maxProgress must be a safe positive integer",
    );

    /** @type {number} */
    this.maxProgress = maxProgress;

    assert.ok(
      typeof experience === "number" &&
        Number.isFinite(experience) &&
        experience >= 0,
      "Achievements experience must be a non-negative number",
    );

    /**
     * Amount of experience points the user receives after unlocking this achievement.
     *
     * @type {number}
     */
    this.experience = experience;

    assert.ok(
      typeof reward === "number" && Number.isFinite(reward) && reward >= 0,
      "Achievements reward must be a non-negative number",
    );

    /**
     * Amount of reward tokens the user receives after unlocking this achievement.
     *
     * @type {number}
     */
    this.reward = reward;
  }

  /**
   * Calculate current user's progress.
   *
   * @param {import('mongoose').ObjectId} _userId
   * @returns {Promise<number>}
   */
  async getUserProgress(_userId) {
    throw new Error("Not implemented");
  }
};

const assert = require("node:assert");
const Achievement = require("../Achievement");
const { ActionModel } = require("../../models/Action");

/**
 * An achievement that unlocks when user performs certain number of actions.
 */
module.exports = class ActionBasedAchievement extends Achievement {
  static typeName = "ActionBased";

  #actionWeights;

  constructor({ name, config }) {
    super({
      name,
      maxProgress: config.threshold,
      trackedActions: Object.keys(config.actions),
      config,
    });

    this.#actionWeights = config.actions;

    for (const [action, weight] of Object.entries(this.#actionWeights)) {
      assert.ok(
        Number.isSafeInteger(weight),
        `Weight for action "${action}" must be a safe integer`,
      );
    }
  }

  async getUserProgress(userId) {
    const relatedActions = await ActionModel.find({
      account: userId,
      action: { $in: [...this.trackedActions] },
    }).lean();

    let progress = 0;

    for (const { action } of relatedActions) {
      progress += this.#actionWeights[action];
    }

    return Math.max(0, Math.min(this.maxProgress, progress));
  }
};

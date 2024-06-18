const assert = require("node:assert");
const Medal = require("../Medal");
const ms = require("ms");
const { ActionModel } = require("../../models/Action");
const { subMilliseconds } = require("date-fns/subMilliseconds");
const { MedalModel } = require("../../models/Medal");

class _Rank {
  constructor(config, index) {
    const { rank = index, period = "30 days", threshold = index + 1 } = config;

    /** @type {number} */
    this.periodMs = ms(period);

    assert.ok(this.periodMs > 1_000_000);

    this.rank = rank;
    this.threshold = threshold;
  }
}

/**
 * A medal given for performing specified number of certain actions within a time frame, e.g. for writing 10 posts in one month.
 *
 * The medal can be recalled automatically if user does not perform another number of same actions within some time frame.
 * E.g. if user does not write any posts for another month.
 */
module.exports = class ActionBasedMedal extends Medal {
  static typeName = "ActionBased";

  constructor({ name, config }) {
    super({ name });

    this._actionWeights = config.actions;
    this._actionTypes = Object.keys(config.actions);

    assert.ok(this._actionTypes.length > 0);

    /** @type {_Rank[]} */
    this._ranks = config.ranks
      .map((cfg, index) => new _Rank(cfg, index))
      .sort((a, b) => b.rank - a.rank);

    assert.ok(this._ranks.length > 0);

    /** @type {number} */
    this._maxPeriodMs = Math.max(...this._ranks.map((rank) => rank.periodMs));
    /** @type {number} */
    this._minScore = Math.min(...this._ranks.map((rank) => rank.threshold));

    if (config.recall?.enabled) {
      /** @type {boolean} */
      this._recallEnabled = true;
      /** @type {number} */
      this._recallPeriodMs = ms(config.recall.period ?? "30 days");
      /** @type {number} */
      this._recallThreshold = config.recall.threshold ?? 1;
    } else {
      this._recallEnabled = false;
      this._recallPeriodMs = Infinity;
      this._recallThreshold = 0;
    }
  }

  async *_findPotentiallyEligible(now) {
    const visited = new Set();
    const scores = new Map();

    for await (const { account, action } of ActionModel.find(
      {
        action: { $in: this._actionTypes },
        createdAt: { $gte: subMilliseconds(now, this._maxPeriodMs), $lt: now },
      },
      { account: 1, action: 1 },
    )) {
      const idString = account.toString();
      if (visited.has(idString)) {
        continue;
      }

      const score = (scores.get(idString) ?? 0) + this._actionWeights[action];
      scores.set(idString, score);

      if (score < this._minScore) {
        continue;
      }

      yield account;
      visited.add(idString);
    }
  }

  async _getAccountScore(accountId, now, since) {
    const actionScores = await Promise.all(
      Object.entries(this._actionWeights).map(
        async (action, weight) =>
          weight *
          (await ActionModel.countDocuments({
            account: accountId,
            action,
            createdAt: { $gte: since, $lt: now },
          })),
      ),
    );

    return actionScores.reduce((a, b) => a + b);
  }

  async *findEligible() {
    const now = new Date();

    for await (const account of this._findPotentiallyEligible(now)) {
      for (const rank of this._ranks) {
        const startDate = subMilliseconds(now, rank.periodMs);

        const score = await this._getAccountScore(account, now, startDate);

        if (score >= rank.threshold) {
          yield { account, rank: rank.rank };
          break;
        }
      }
    }
  }

  async *findUnworthy() {
    if (!this._recallEnabled) {
      return;
    }

    const now = new Date();

    for await (const medal of MedalModel.find({ medal: this.name })) {
      const score = await this._getAccountScore(
        medal.account,
        now,
        subMilliseconds(now, this._recallPeriodMs),
      );

      if (score < this._recallThreshold) {
        yield medal.account;
      }
    }
  }
};

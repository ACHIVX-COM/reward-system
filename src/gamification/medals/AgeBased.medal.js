const assert = require("node:assert");
const ms = require("ms");
const Medal = require("../Medal");
const { AccountModel } = require("../../models/Account");
const { subMilliseconds } = require("date-fns/subMilliseconds");

class _Rank {
  constructor(config, index) {
    const { rank = index, age } = config;

    assert.ok(Number.isSafeInteger(rank));

    /** @type {number} */
    this.rank = rank;

    /** @type {number} */
    this.minAgeMs = ms(age);

    assert.ok(
      !Number.isNaN(this.minAgeMs),
      `Invalid age value (${age}) for rank #${index}`,
    );

    this.maxAgeMs = new Date().getTime();
  }
}

module.exports = class AgeBasedMedal extends Medal {
  static typeName = "AgeBased";

  constructor({ name, config }) {
    super({ name });

    /** @type {_Rank[]} */
    this._ranks = (config.ranks ?? [])
      .map((rankConf, index) => new _Rank(rankConf, index))
      .sort((a, b) => a.rank - b.rank);

    for (let i = 0; i < this._ranks.length - 1; ++i) {
      this._ranks[i].maxAgeMs = this._ranks[i + 1].minAgeMs;
    }
  }

  async *findEligible() {
    const now = new Date();

    for (const rank of this._ranks) {
      for await (const { _id } of AccountModel.aggregate([
        {
          $match: {
            registeredAt: {
              $gt: subMilliseconds(now, rank.maxAgeMs),
              $lte: subMilliseconds(now, rank.minAgeMs),
            },
          },
        },
        {
          $lookup: {
            from: "medals",
            as: "existingMedal",
            let: {
              accountId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$account", "$$accountId"] },
                      { $eq: ["$medal", this.name] },
                      { $gte: ["$rank", rank.rank] },
                    ],
                  },
                },
              },
            ],
          },
        },
        {
          $match: {
            existingMedal: { $eq: [] },
          },
        },
        { $project: { _id: 1 } },
      ]).read("secondaryPreferred")) {
        yield { account: _id, rank: rank.rank };
      }
    }
  }

  async *findUnworthy() {
    yield* [];
  }
};

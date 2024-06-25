const assert = require("node:assert");
const { AccountModel } = require("../../models/Account");
const LeaderBoard = require("../LeaderBoard");

module.exports = class ActionBasedLeaderBoard extends LeaderBoard {
  static typeName = "ActionBased";

  constructor({ name, config }) {
    super({ name });

    const { size } = config;

    assert.ok(
      Number.isSafeInteger(size) && size > 0,
      `Leader board ${name} size must be a positive integer, but is ${size}`,
    );

    this._size = size;

    this._actions = Object.keys(config.actions);
    this._actionWeights = config.actions;
  }

  async *getLeaders() {
    const cursor = AccountModel.aggregate([
      {
        $lookup: {
          from: "actions",
          as: "actions",
          let: { account: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$account", "$$account"] },
                    { $in: ["$action", this._actions] },
                  ],
                },
              },
            },
            {
              $project: {
                weight: {
                  $switch: {
                    branches: Object.entries(this._actionWeights).map(
                      ([action, weight]) => ({
                        case: { $eq: ["$action", action] },
                        then: weight,
                      }),
                    ),
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: null,
                weight: { $sum: "$weight" },
              },
            },
          ],
        },
      },
      {
        $unwind: "$actions",
      },
      {
        $project: {
          externalId: "$externalId",
          score: "$actions.weight",
        },
      },
      { $sort: { "actions.weight": -1 } },
      { $limit: this._size },
    ]).read("secondaryPreferred");

    for await (const { externalId, score } of cursor) {
      yield { externalId, score };
    }
  }
};

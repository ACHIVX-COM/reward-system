const assert = require("node:assert");
const { AccountModel } = require("../../models/Account");
const LeaderBoard = require("../LeaderBoard");

module.exports = class ExperienceBasedLeaderBoard extends LeaderBoard {
  static typeName = "ExperienceBased";

  constructor({ name, config }) {
    super({ name });

    const { size } = config;

    assert.ok(
      Number.isSafeInteger(size) && size > 0,
      `Leader board ${name} size must be a positive integer, but is ${size}`,
    );

    /** @type {number} */
    this._size = size;
  }

  async *getLeaders() {
    for await (const { externalId, experience } of AccountModel.find(
      {},
      { externalId: 1, experience: 1 },
      { sort: { experience: -1 }, limit: this._size },
    ).read("secondaryPreferred")) {
      yield {
        externalId,
        score: experience,
      };
    }
  }
};

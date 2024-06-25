const assert = require("node:assert");
const { LeaderBoardSnapshotModel } = require("../models/LeaderBoardSnapshot");
const { getLeaderBoards } = require("./gamificationService");

/**
 * @param {import('../gamification/LeaderBoard')} leaderBoard
 */
async function updateLeaderBoard(leaderBoard) {
  const leaders = [];

  for await (const { externalId, score } of leaderBoard.getLeaders()) {
    assert.ok(externalId);
    assert.ok(score !== undefined);
    leaders.push({ externalId, score });
  }

  await LeaderBoardSnapshotModel.updateOne(
    { leaderBoard: leaderBoard.name },
    { $set: { leaders } },
    { upsert: true },
  );
}

module.exports.getJobs = function getJobs() {
  return getLeaderBoards().map((leaderBoard) => ({
    name: `update-leader-board@${leaderBoard.name}`,
    description: `Update ${leaderBoard.name} leader board`,
    run: () => updateLeaderBoard(leaderBoard),
  }));
};

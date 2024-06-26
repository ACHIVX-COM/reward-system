const {
  LeaderBoardSnapshotModel,
} = require("../../models/LeaderBoardSnapshot");
const { getLeaderBoards } = require("../../services/gamificationService");
const { authenticateCall } = require("../authenticate");
const {
  NotFound,
  InvalidArgument,
  FailedPrecondition,
} = require("../utils/errors");
const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const streamAsyncImpl = require("../utils/streamAsyncImpl");

module.exports.GetLeaderBoard = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { leaderBoard } = call.request;

  if (!leaderBoard) {
    throw new InvalidArgument("Missing leader board name");
  }

  if (!getLeaderBoards().some((lb) => lb.name === leaderBoard)) {
    throw new NotFound(`Leader board ${leaderBoard} not found`);
  }

  const leaderBoardDoc = await LeaderBoardSnapshotModel.findOne({
    leaderBoard,
  });

  if (!leaderBoardDoc) {
    throw new FailedPrecondition(
      `Leader board ${leaderBoard} is not initialized. Please run update-leader-board@${leaderBoard} job for the first time.`,
    );
  }

  return {
    leaders: leaderBoardDoc.leaders.map(({ externalId, score }) => ({
      account: externalId,
      score,
    })),
    updatedAt: leaderBoardDoc.updatedAt.toISOString(),
  };
});

module.exports.GetLeaderBoardsList = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  for (const leaderBoard of getLeaderBoards()) {
    yield { name: leaderBoard.name };
  }
});

const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { AccountModel } = require("../../models/Account");
const { NotFound, InvalidArgument } = require("../utils/errors");
const { authenticateCall } = require("../authenticate");
const {
  getAccountAchievements,
} = require("../../services/gamificationService");

module.exports.GetAccountAchievements = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  const {
    request: { account: externalId },
  } = call;

  if (!externalId) {
    throw new InvalidArgument("Missing account ID");
  }

  const account = await AccountModel.findOne({ externalId });

  if (!account) {
    throw new NotFound("Account not found");
  }

  for await (const {
    achievement,
    unlockAction,
    progress,
  } of getAccountAchievements(account._id)) {
    yield {
      name: achievement.name,
      progress,
      maxProgress: achievement.maxProgress,
      unlockedAt: unlockAction?.createdAt?.toISOString?.(),
    };
  }
});

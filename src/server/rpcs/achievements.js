const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { AccountModel } = require("../../models/Account");
const { AchievementModel } = require("../../models/Achievement");
const { NotFound, InvalidArgument, AlreadyExists } = require("../utils/errors");
const { authenticateCall } = require("../authenticate");
const {
  assignAchievement,
  InvalidAchievementError,
  DuplicateAchievementError,
  getAchievementsConfigurations,
} = require("../../services/gamificationService");
const { useMongodbSession } = require("../../utils/useMongoSession");

function achievementToResponse(achievement) {
  return {
    achievement: achievement.achievement,
    key: achievement.key ?? undefined,
    assignedAt: achievement.createdAt.toISOString(),
  };
}

module.exports.GetAccountAchievements = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  const { account } = call.request;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new NotFound("Account not found");
  }

  for await (const achievement of AchievementModel.find({
    account: accountDoc._id,
  })) {
    yield achievementToResponse(achievement);
  }
});

module.exports.AssignAchievement = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { account, achievement, key } = call.request;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  if (!achievement) {
    throw new InvalidArgument("Missing achievement name");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new NotFound("Account not found");
  }

  try {
    const assigned = await useMongodbSession((session) =>
      assignAchievement(accountDoc._id, achievement, key, session),
    );

    return achievementToResponse(assigned);
  } catch (e) {
    if (e instanceof InvalidAchievementError) {
      throw new InvalidArgument(e.message);
    }

    if (e instanceof DuplicateAchievementError) {
      throw new AlreadyExists("Achievement already exists");
    }

    throw e;
  }
});

module.exports.GetAchievementsConfiguration = streamAsyncImpl(
  async function* (call) {
    await authenticateCall(call);

    const configurations = getAchievementsConfigurations();

    for (const [
      name,
      { xp = 0, reward = 0, repeatable = false },
    ] of Object.entries(configurations)) {
      yield {
        name,
        xp,
        reward,
        repeatable,
      };
    }
  },
);

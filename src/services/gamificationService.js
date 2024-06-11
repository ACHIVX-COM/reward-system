const assert = require("node:assert");
const { AccountModel } = require("../models/Account");
const { AchievementModel } = require("../models/Achievement");
const { createTransactions } = require("./internalTransactionsService");
const isMongodbDuplicationError = require("../utils/isMongodbDuplicationError");
const { default: Decimal } = require("decimal.js-light");
const { STATUSES } = require("../models/InternalTransaction");

const gamificationConfig = require(
  process.env.GAMIFICATION_CONFIG_PATH ?? "../../config/gamification.json",
);

/**
 * @typedef {Object} Level
 * @property {number} xp minimum XP, inclusive
 * @property {number} maxXp maximum XP, exclusive
 * @property {number} id
 * @property {number} reward
 */

class LevelsConfig {
  constructor(levelsConfig) {
    /** @type {Level[]} */
    this.levels = [
      {
        xp: 0,
        maxXp: +Infinity,
        id: 0,
        reward: 0,
      },
    ];

    for (const levelConfig of levelsConfig) {
      const prev = this.levels[this.levels.length - 1];

      if (levelConfig.xp <= prev.xp) {
        assert.fail(
          `Level ${this.levels.length} xp threshold should be greater than xp threshold (${prev.xp}) of previous level but is set to ${levelConfig.xp}`,
        );
      }

      const reward = levelConfig.reward ?? 0;

      if (reward < 0) {
        assert.fail(
          `Level ${this.levels.length} reward should not be less than 0 but is ${reward}`,
        );
      }

      this.levels.push({
        xp: levelConfig.xp,
        reward,
        id: this.levels.length,
        maxXp: +Infinity,
      });

      prev.maxXp = levelConfig.xp;
    }
  }

  getLevelByXp(xp) {
    for (const level of this.levels) {
      if (xp < level.maxXp) {
        return level.id;
      }
    }

    assert.fail("unreachable");
  }
}

const levelsConfig = new LevelsConfig(gamificationConfig.levels);

/**
 * Pays rewards for level upgrade.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {number} fromLevel
 * @param {number} toLevel
 * @param {import('mongoose').mongo.ClientSession} session
 */
async function rewardAccountLevelUp(accountId, fromLevel, toLevel, session) {
  let reward = 0;

  for (let lv = fromLevel + 1; lv <= toLevel; ++lv) {
    reward += levelsConfig.levels[lv].reward;
  }

  if (reward > 0) {
    await createTransactions(
      [
        {
          account: accountId,
          amount: reward.toString(),
          status: STATUSES.PAID,
          meta: {
            levelupReward: "true",
            levelupFrom: `${fromLevel}`,
            levelupTo: `${toLevel}`,
          },
        },
      ],
      session,
    );
  }

  await AccountModel.updateOne(
    { _id: accountId },
    { $set: { rewardedLevel: toLevel } },
    { session },
  );
}

/**
 * Give user some experience points.
 *
 * Pays rewards if user reaches new level.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {number} experience
 * @param {import('mongoose').mongo.ClientSession} session
 */
async function addExperience(accountId, experience, session) {
  assert.ok(experience >= 1);
  assert.ok(session);

  const account = await AccountModel.findOneAndUpdate(
    { _id: accountId },
    { $inc: { experience } },
    { new: true, session },
  );
  const currentLevel = levelsConfig.getLevelByXp(account.experience);

  if (currentLevel > account.rewardedLevel) {
    await rewardAccountLevelUp(
      accountId,
      account.rewardedLevel,
      currentLevel,
      session,
    );
  }
}

/**
 * Take some experience points away from user.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {number} experience
 * @param {import('mongoose').mongo.ClientSession} session
 */
async function subExperience(accountId, experience, session) {
  assert.ok(experience >= 0);
  assert.ok(session);

  let res = await AccountModel.updateOne(
    { _id: accountId, experience: { $gte: experience } },
    { $inc: { experience: -experience } },
    { session },
  );

  if (res.modifiedCount === 1) {
    return;
  }

  res = await AccountModel.updateOne(
    { _id: accountId, experience: { $lt: experience } },
    { $set: { experience: 0 } },
    { session },
  );

  assert.ok(res.modifiedCount === 1);
}

/**
 * Pay reward for an achievement.
 *
 * If reward is negative, it may be cancelled or it's value may be changed to avoid accounts balance going negative.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {number} reward
 * @param {{}} meta
 * @param {import('mongoose').mongo.ClientSession} session
 */
async function payAchievementReward(accountId, reward, meta, session) {
  let amount;

  if (reward < 0) {
    const { balance } = await AccountModel.findById(accountId).lean();

    const balanceDecimal = new Decimal(balance.toString());

    if (balanceDecimal.isZero()) {
      return;
    }

    amount = balanceDecimal.greaterThanOrEqualTo(-reward)
      ? reward.toString()
      : balanceDecimal.neg().toString();
  } else if (reward > 0) {
    amount = reward.toString();
  } else {
    return;
  }

  await createTransactions(
    [
      {
        account: accountId,
        amount,
        status: STATUSES.PAID,
        meta,
      },
    ],
    session,
  );
}

const InvalidAchievementError =
  (module.exports.InvalidAchievementError = class InvalidAchievementError extends (
    Error
  ) {});

const DuplicateAchievementError =
  (module.exports.DuplicateAchievementError = class DuplicateAchievementError extends (
    Error
  ) {});

/**
 * Assign an achievement to account. Modify account experience, handle level change, pay rewards if necessary.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {string} achievement
 * @param {string?} key
 * @param {import('mongoose').mongo.ClientSession} session
 * @returns {import('mongoose').Document?} created achievement document
 * @throws {InvalidAchievementError} if the achievement name is unknown
 * @throws {InvalidAchievementError} if the key is missing for repeatable achievement
 * @throws {InvalidAchievementError} if the key is present for non-repeatable achievement
 * @throws {DuplicateAchievementError} if the achievement already exists
 */
module.exports.assignAchievement = async function assignAchievement(
  accountId,
  achievement,
  key,
  session,
) {
  const achievementConfig = gamificationConfig.achievements[achievement];

  if (!achievementConfig) {
    throw new InvalidAchievementError(
      `Unknown achievement name: ${achievement}`,
    );
  }

  const { repeatable, xp = 0, reward = 0 } = achievementConfig;

  if (repeatable && !key) {
    throw new InvalidAchievementError(
      `Achievement ${achievement} is repeatable but key is not provided`,
    );
  }

  if (!repeatable && !!key) {
    throw new InvalidAchievementError(
      `Achievement ${achievement} is not repeatable but key is provided`,
    );
  }

  let achievementDoc = null;

  try {
    [achievementDoc] = await AchievementModel.create(
      [
        {
          achievement,
          account: accountId,
          key: key ?? null,
        },
      ],
      { session },
    );
  } catch (e) {
    if (isMongodbDuplicationError(e)) {
      throw new DuplicateAchievementError();
    }

    throw e;
  }

  if (xp > 0) {
    await addExperience(accountId, achievementConfig.xp, session);
  } else if (xp < 0) {
    await subExperience(accountId, -achievementConfig.xp, session);
  }

  await payAchievementReward(
    accountId,
    reward,
    {
      achievement,
      achievementId: achievementDoc._id.toString(),
      achievementKey: key || undefined,
    },
    session,
  );

  return achievementDoc;
};

/**
 * Returns user level based on user experience.
 *
 * @param {number} xp
 * @returns number
 */
module.exports.getLevelByXp = function getLevelByXp(xp) {
  return levelsConfig.getLevelByXp(xp);
};

module.exports.getAchievementsConfigurations =
  function getAchievementsConfigurations() {
    return gamificationConfig.achievements ?? {};
  };

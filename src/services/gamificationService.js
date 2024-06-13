const assert = require("node:assert");
const { AccountModel } = require("../models/Account");
const { ActionModel } = require("../models/Action");
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
 * Pay reward for an action.
 *
 * If reward is negative, it may be cancelled or it's value may be changed to avoid accounts balance going negative.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {number} reward
 * @param {{}} meta
 * @param {import('mongoose').mongo.ClientSession} session
 */
async function payActionReward(accountId, reward, meta, session) {
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

const InvalidActionError =
  (module.exports.InvalidActionError = class InvalidActionError extends (
    Error
  ) {});

const DuplicateActionError =
  (module.exports.DuplicateActionError = class DuplicateActionError extends (
    Error
  ) {});

/**
 * Record an action performed by a user. Modify account experience, handle level change, pay rewards if necessary.
 *
 * @param {import('mongoose').Types.ObjectId} accountId
 * @param {string} action
 * @param {string?} key
 * @param {import('mongoose').mongo.ClientSession} session
 * @returns {import('mongoose').Document?} created action document
 * @throws {InvalidActionError} if the action name is unknown
 * @throws {InvalidActionError} if the key is missing for repeatable action
 * @throws {InvalidActionError} if the key is present for non-repeatable action
 * @throws {DuplicateActionError} if the action already exists
 */
module.exports.createAction = async function createAction(
  accountId,
  action,
  key,
  session,
) {
  const actionConfig = gamificationConfig.actions[action];

  if (!actionConfig) {
    throw new InvalidActionError(`Unknown action name: ${action}`);
  }

  const { repeatable, xp = 0, reward = 0 } = actionConfig;

  if (repeatable && !key) {
    throw new InvalidActionError(
      `Action ${action} is repeatable but key is not provided`,
    );
  }

  if (!repeatable && !!key) {
    throw new InvalidActionError(
      `Action ${action} is not repeatable but key is provided`,
    );
  }

  let actionDoc = null;

  try {
    [actionDoc] = await ActionModel.create(
      [
        {
          action,
          account: accountId,
          key: key ?? null,
        },
      ],
      { session },
    );
  } catch (e) {
    if (isMongodbDuplicationError(e)) {
      throw new DuplicateActionError();
    }

    throw e;
  }

  if (xp > 0) {
    await addExperience(accountId, actionConfig.xp, session);
  } else if (xp < 0) {
    await subExperience(accountId, -actionConfig.xp, session);
  }

  await payActionReward(
    accountId,
    reward,
    {
      action,
      actionId: actionDoc._id.toString(),
      actionKey: key || undefined,
    },
    session,
  );

  return actionDoc;
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

module.exports.getActionsConfigurations = function getActionsConfigurations() {
  return gamificationConfig.actions ?? {};
};

const assert = require("node:assert");
const { AccountModel } = require("../models/Account");
const { ActionModel } = require("../models/Action");
const { createTransactions } = require("./internalTransactionsService");
const isMongodbDuplicationError = require("../utils/isMongodbDuplicationError");
const { default: Decimal } = require("decimal.js-light");
const { STATUSES } = require("../models/InternalTransaction");
const { medalTypes } = require("../gamification");
const { MedalModel } = require("../models/Medal");
const asyncGenChunks = require("../utils/asyncGenChunks");
const { useMongodbSession } = require("../utils/useMongoSession");

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
 * @type {import('../gamification/Medal')[]}
 */
const medals = Object.entries(gamificationConfig.medals ?? {}).map(
  ([name, { type, ...config }]) => {
    const MedalType = medalTypes.get(type);

    assert.ok(
      MedalType,
      `Medal type for medal "${name}" must be a valid medal type name but is "${type}"`,
    );

    return new MedalType({ name, config });
  },
);

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
 * @typedef {Object} ActionParameters
 * @property {string} action
 * @property {import('mongoose').Types.ObjectId} accountId
 * @property {string?} key
 * @property {number?} experienceOverride
 * @property {number?} rewardOverride
 */

/**
 * Record an action performed by a user. Modify account experience, handle level change, pay rewards if necessary.
 *
 * @param {ActionParameters} actionParameters
 * @param {import('mongoose').mongo.ClientSession} session
 * @returns {import('mongoose').Document?} created action document
 * @throws {InvalidActionError} if the action name is unknown
 * @throws {InvalidActionError} if the key is missing for repeatable action
 * @throws {InvalidActionError} if the key is present for non-repeatable action
 * @throws {DuplicateActionError} if the action already exists
 */
module.exports.createAction = async function createAction(
  { accountId, action, key, experienceOverride, rewardOverride },
  session,
) {
  assert.ok(session);

  const actionConfig = gamificationConfig.actions[action];

  if (!actionConfig) {
    throw new InvalidActionError(`Unknown action name: ${action}`);
  }

  const {
    repeatable = false,
    trackActivity = true,
    xp: defaultXp = 0,
    reward: defaultReward = 0,
  } = actionConfig;
  const experience = experienceOverride ?? defaultXp;
  const reward = rewardOverride ?? defaultReward;

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
          experience,
          reward,
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

  if (trackActivity) {
    await AccountModel.updateOne(
      {
        _id: accountId,
        lastActiveAt: { $not: { $gte: actionDoc.createdAt } },
      },
      { $set: { lastActiveAt: actionDoc.createdAt } },
      { session },
    );
  }

  if (experience > 0) {
    await addExperience(accountId, experience, session);
  } else if (experience < 0) {
    await subExperience(accountId, -experience, session);
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

module.exports.payLostLevelupRewards = async function payLostLevelupRewards() {
  for (const level of levelsConfig.levels) {
    if (level.reward <= 0) {
      continue;
    }

    for await (const account of AccountModel.find({
      experience: { $gte: level.xp },
      rewardedLevel: { $lt: level.id },
    })) {
      await useMongodbSession(async (session) => {
        const acc = await AccountModel.findOne(
          {
            _id: account._id,
            experience: { $gte: level.xp },
            rewardedLevel: { $lt: level.id },
          },
          null,
          { session },
        );

        if (!acc) {
          return;
        }

        await rewardAccountLevelUp(
          account._id,
          acc.rewardedLevel,
          levelsConfig.getLevelByXp(acc.experience),
          session,
        );
      });
    }
  }
};

module.exports.getActionsConfigurations = function getActionsConfigurations() {
  return gamificationConfig.actions ?? {};
};

module.exports.getXpReductionConfiguration =
  function getXpReductionConfiguration() {
    const {
      experienceReduction: {
        enabled = false,
        amount = 200,
        delay = "30 days",
        interval = "30 days",
      } = {},
    } = gamificationConfig;

    return { enabled, amount, delay, interval };
  };

module.exports.updateMedals = async function updateMedals() {
  for (const medal of medals) {
    console.log(`Updating medal ${medal.name}...`);

    let upgraded = 0;
    let awarded = 0;

    for await (const eligibleChunk of asyncGenChunks(medal.findEligible())) {
      const bulkOps = [];

      for (const eligible of eligibleChunk) {
        bulkOps.push(
          {
            updateOne: {
              filter: {
                account: eligible.account,
                rank: { $lt: eligible.rank },
                medal: medal.name,
              },
              update: { $set: { rank: eligible.rank } },
              upsert: false,
            },
          },
          {
            updateOne: {
              filter: { account: eligible.account, medal: medal.name },
              update: {
                $setOnInsert: {
                  account: eligible.account,
                  rank: eligible.rank,
                  medal: medal.name,
                },
              },
              upsert: true,
            },
          },
        );
      }

      const { upsertedCount, modifiedCount } =
        await MedalModel.bulkWrite(bulkOps);

      awarded += upsertedCount;
      upgraded += modifiedCount;
    }

    console.log(
      `Awarded ${awarded} user(s) with ${medal.name} medal, ${upgraded} user(s) upgraded`,
    );

    let recalled = 0;

    for await (const unworthyChunk of asyncGenChunks(medal.findUnworthy())) {
      const { deletedCount } = await MedalModel.deleteMany({
        medal: medal.name,
        account: { $in: unworthyChunk },
      });

      recalled += deletedCount;
    }

    console.log(`Recalled ${recalled} ${medal.name} medal(s)`);
  }
};

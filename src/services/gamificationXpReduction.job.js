const assert = require("node:assert");
const ms = require("ms");
const { getXpReductionConfiguration } = require("./gamificationService");
const { AccountModel } = require("../models/Account");
const { subMilliseconds } = require("date-fns/subMilliseconds");

async function reduceXP() {
  const { enabled, amount, delay, interval } = getXpReductionConfiguration();

  if (!enabled) {
    console.log("Experience reduction is disabled");
    return;
  }

  assert.ok(Number.isSafeInteger(amount) && amount > 0);

  const now = new Date();
  const activityThreshold = subMilliseconds(now, ms(delay));
  const repeatThreshold = subMilliseconds(now, ms(interval));

  const { modifiedCount: decrementedCount } = await AccountModel.updateMany(
    {
      experience: { $gt: amount },
      lastActiveAt: { $lt: activityThreshold },
      $or: [
        { experienceReducedAt: { $lt: repeatThreshold } },
        { experienceReducedAt: { $exists: false } },
      ],
    },
    {
      $inc: { experience: -amount },
      $set: { experienceReducedAt: now },
    },
  );

  const { modifiedCount: resetCount } = await AccountModel.updateMany(
    {
      experience: { $lte: amount },
      lastActiveAt: { $lt: activityThreshold },
      $or: [
        { experienceReducedAt: { $lt: repeatThreshold } },
        { experienceReducedAt: { $exists: false } },
      ],
    },
    {
      $set: { experienceReducedAt: now, experience: 0 },
    },
  );

  console.log(
    `Reduced experience of ${decrementedCount + resetCount} account(s) (${resetCount} to zero)`,
  );
}

module.exports.getJobs = function getJobs() {
  return [
    {
      name: "reduce-xp",
      description: "Reduces XP of long inactive accounts",
      run: reduceXP,
    },
  ];
};

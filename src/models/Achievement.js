const mongoose = require("mongoose");

const achievementSchema = mongoose.Schema(
  {
    account: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    achievement: {
      type: String,
      required: true,
    },
    // Identifier of achievement instance for repeatable achievements.
    // E.g. post identifier for "write post" achievement.
    key: {
      type: String,
    },
  },
  { timestamps: true },
);

achievementSchema.index(
  {
    account: 1,
    achievement: 1,
    key: 1,
  },
  {
    unique: true,
  },
);

/**
 * @type {mongoose.Model}
 */
module.exports.AchievementModel = mongoose.model(
  "Achievement",
  achievementSchema,
);

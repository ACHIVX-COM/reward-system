const mongoose = require("mongoose");

const achievementSchema = mongoose.Schema({
  account: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  achievement: {
    type: String,
    required: true,
  },
  key: {
    type: String,
  },
});

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

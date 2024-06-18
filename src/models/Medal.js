const mongoose = require("mongoose");

const medalSchema = mongoose.Schema({
  account: {
    type: mongoose.Types.ObjectId,
    ref: "Account",
    required: true,
  },
  medal: {
    type: String,
    required: true,
  },
  rank: {
    type: Number,
    required: true,
  },
});

medalSchema.index({ medal: 1, account: 1 }, { unique: true });

/**
 * @type {mongoose.Model}
 */
module.exports.MedalModel = mongoose.model("Medal", medalSchema);

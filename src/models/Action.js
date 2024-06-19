const mongoose = require("mongoose");

const actionSchema = mongoose.Schema(
  {
    account: {
      type: mongoose.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    // Identifier of action instance for repeatable actions.
    // E.g. post identifier for "write post" action.
    key: {
      type: String,
    },

    experience: {
      type: Number,
      required: true,
      default: 0,
    },
    reward: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true, read: "secondaryPreferred" },
);

actionSchema.index(
  {
    account: 1,
    action: 1,
    key: 1,
  },
  {
    unique: true,
  },
);

actionSchema.index({ account: 1, createdAt: -1 });
actionSchema.index({ action: 1, createdAt: -1 });

/**
 * @type {mongoose.Model}
 */
module.exports.ActionModel = mongoose.model("Action", actionSchema);

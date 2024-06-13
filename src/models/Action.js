const mongoose = require("mongoose");

const actionSchema = mongoose.Schema(
  {
    account: {
      type: mongoose.Types.ObjectId,
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
  },
  { timestamps: true },
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

/**
 * @type {mongoose.Model}
 */
module.exports.ActionModel = mongoose.model("Action", actionSchema);

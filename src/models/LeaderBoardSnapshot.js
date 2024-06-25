const mongoose = require("mongoose");

const leaderSchema = mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const leaderBoardSnapshotSchema = mongoose.Schema(
  {
    leaderBoard: {
      type: String,
      unique: true,
      required: true,
    },
    leaders: {
      type: [leaderSchema],
      required: true,
    },
  },
  {
    timestamps: true,
    read: "secondaryPreferred",
  },
);

module.exports.LeaderBoardSnapshotModel = mongoose.model(
  "LeaderBoardSnapshot",
  leaderBoardSnapshotSchema,
);

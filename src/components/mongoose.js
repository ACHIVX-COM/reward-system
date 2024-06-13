const mongoose = require("mongoose");

require("../models/Account");
require("../models/InternalTransaction");
require("../models/JobStatusModel");
require("../models/Action");

module.exports.mongoose = mongoose;

module.exports.connect = async function () {
  const mongodbUri = process.env.MONGODB_URI;

  if (!mongodbUri) {
    throw new Error("MONGODB_URI environment variable is missing");
  }

  return await mongoose.connect(mongodbUri);
};

module.exports.disconnect = async function () {
  await mongoose.disconnect();
};

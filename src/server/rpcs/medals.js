const { AccountModel } = require("../../models/Account");
const { MedalModel } = require("../../models/Medal");
const { InvalidArgument, NotFound } = require("../utils/errors");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { authenticateCall } = require("../authenticate");

module.exports.GetAccountMedals = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  const { account } = call.request;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new NotFound("Account not found");
  }

  for await (const medal of MedalModel.find({ account: accountDoc._id })) {
    yield {
      medal: medal.medal,
      rank: medal.rank,
    };
  }
});

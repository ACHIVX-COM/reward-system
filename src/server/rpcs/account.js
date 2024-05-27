const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const { AccountModel } = require("../../models/Account");
const { NotFound, InvalidArgument } = require("../utils/errors");
const { authenticateCall } = require("../authenticate");
const { default: mongoose } = require("mongoose");

function accountToDetailedResponse(account) {
  return {
    id: account.externalId,
    balance: account.balance.toString(),
    withdrawalAddresses: account.withdrawalAddresses.map(
      ({ network, address }) => ({ network, address }),
    ),
  };
}

module.exports.GetAccountDetails = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const {
    request: { id },
  } = call;

  if (!id) {
    throw new InvalidArgument("Missing account ID");
  }

  const account = await AccountModel.findOne({ externalId: id });

  if (!account) {
    throw new NotFound("Account not found");
  }

  return accountToDetailedResponse(account);
});

module.exports.UpsertAccount = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const {
    request: { id },
  } = call;

  if (!id) {
    throw new InvalidArgument("Missing account ID");
  }

  const account = await AccountModel.findOneAndUpdate(
    { externalId: id },
    { $set: { externalId: id } },
    { upsert: true, new: true },
  );

  return accountToDetailedResponse(account);
});

module.exports.AddWithdrawalAddress = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const {
    request: { account: accountId, network, address },
  } = call;

  if (!accountId) {
    throw new InvalidArgument("Missing account ID");
  }

  if (!network) {
    throw new InvalidArgument("Missing network name");
  }

  if (!address) {
    throw new InvalidArgument("Missing address");
  }

  const account = await AccountModel.findOne({ externalId: accountId });

  if (!account) {
    throw new NotFound("Account not found");
  }

  account.withdrawalAddresses.push({ network, address });

  await account.updateOne({
    $pull: { withdrawalAddresses: { network, address } },
  });

  try {
    await account.save();
  } catch (e) {
    if (e instanceof mongoose.Error.ValidationError) {
      throw new InvalidArgument(e.message);
    }

    throw e;
  }

  await account.updateOne({
    $pull: { withdrawalAddresses: { network, address: { $ne: address } } },
  });

  return accountToDetailedResponse(
    await AccountModel.findById(account._id).lean(),
  );
});

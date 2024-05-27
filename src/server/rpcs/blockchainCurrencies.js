const { allCurrencies } = require("../../blockchain");
const { authenticateCall } = require("../authenticate");
const { InvalidArgument, NotFound } = require("../utils/errors");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const unaryAsyncImpl = require("../utils/unaryAsyncImpl");

module.exports.GetCurrencies = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  for (const [name, currency] of allCurrencies.entries()) {
    yield {
      name,
      typeName: currency.constructor.typeName,
      network: currency.network.name,
    };
  }
});

module.exports.GetMasterWalletBalance = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { currency } = call.request;

  if (!currency) {
    throw new InvalidArgument("Currency name is missing");
  }

  if (!allCurrencies.has(currency)) {
    throw new NotFound("Currency not found");
  }

  return {
    balance: await allCurrencies.get(currency).getMasterWalletBalance(),
  };
});

const { allNetworks } = require("../../blockchain");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const { authenticateCall } = require("../authenticate");
const { InvalidArgument, NotFound } = require("../utils/errors");

module.exports.GetNetworks = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  for (const [name, network] of allNetworks.entries()) {
    yield {
      name,
      typeName: network.constructor.typeName,
    };
  }
});

module.exports.ValidateWalletAddress = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { network, address } = call.request;

  if (!network) {
    throw new InvalidArgument("Network name is missing");
  }

  if (!address) {
    throw new InvalidArgument("Address is missing");
  }

  if (!allNetworks.has(network)) {
    throw new NotFound("Network not found");
  }

  return { isValid: allNetworks.get(network).isValidAddress(address) };
});

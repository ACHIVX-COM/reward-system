const mongoose = require("mongoose");

const withdrawalAddressSchema = mongoose.Schema(
  {
    network: {
      type: String,
      required: true,
      validate: [
        function (network) {
          const blockchain = require("../blockchain");

          if (!blockchain.allNetworks.has(network)) {
            return false;
          }
        },
        "Unknown blockchain network name: {VALUE}",
      ],
    },
    address: {
      type: String,
      required: true,
      validate: {
        validator(address) {
          const blockchain = require("../blockchain");

          const network = blockchain.allNetworks.get(this.network);

          if (!network) {
            // Will be rejected by network validator.
            return;
          }

          if (!network.isValidAddress(address)) {
            throw new Error(`Invalid ${network.name} address: ${address}`);
          }
        },
      },
    },
  },
  { _id: false },
);

const accountSchema = mongoose.Schema({
  externalId: {
    required: true,
    type: String,
    index: true,
    unique: true,
  },
  balance: {
    type: mongoose.Types.Decimal128,
    default: 0,
    min: 0,
  },
  withdrawalAddresses: {
    type: [withdrawalAddressSchema],
    default: [],
  },
});

/**
 * @type {mongoose.Model}
 */
module.exports.AccountModel = mongoose.model("Account", accountSchema);

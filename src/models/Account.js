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

  registeredAt: {
    type: Date,
    default: () => new Date(),
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

  experience: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Highest level this account did ever reach (and receive reward, if any).
  // This is stored to avoid sending reward for same level twice if the user gets downgraded and then reaches the same level again.
  rewardedLevel: {
    type: Number,
    default: 0,
    min: 0,
  },

  lastActiveAt: {
    type: Date,
    required: false,
  },

  experienceReducedAt: {
    type: Date,
    required: false,
  },
});

accountSchema.index({ rewardedLevel: 1, experience: 1 });

/**
 * @type {mongoose.Model}
 */
module.exports.AccountModel = mongoose.model("Account", accountSchema);

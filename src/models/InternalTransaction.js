const mongoose = require("mongoose");

/**
 * All possible transaction statuses.
 *
 * @readonly
 * @enum {string}
 */
const STATUSES = (module.exports.STATUSES = {
  /**
   * Transaction was created but requires confirmation.
   *
   * Transaction from this status can also be safely cancelled (by changing status to DENIED).
   */
  HOLD: "HOLD",
  /**
   * Transaction was approved but requires associated blockchain operations to be performed.
   */
  APPROVED: "APPROVED",
  /**
   * Transaction does not have associated blockchain operations and was performed successfully.
   */
  PAID: "PAID",
  /**
   * Transaction was cancelled.
   */
  DENIED: "DENIED",
  /**
   * Associated blockchain operations are being performed with no known result yet.
   */
  SENDING: "SENDING",
  /**
   * The transaction was approved but attempt to send associated operation to blockchain failed and should be retried again.
   */
  SEND_FAILED: "SEND_FAILED",
  /**
   * The transaction was approved but attempt to send associated operation to blockchain ended with unknown result.
   *
   * This status requires manual update of transaction status after check of blockchain content.
   */
  SEND_UNKNOWN_ERROR: "SEND_UNKNOWN_ERROR",
  /**
   * Transaction did require associated blockchain operations but now they're completed.
   */
  MINED: "MINED",
});

const withdrawalSchema = new mongoose.Schema(
  {
    isWithdrawal: {
      type: Boolean,
    },

    currencyId: {
      type: String,
      required: function () {
        return this.isWithdrawal;
      },
    },

    withdrawalAddress: {
      type: String,
      required: function () {
        return this.isWithdrawal;
      },
    },

    amount: {
      type: mongoose.Types.Decimal128,
      required: function () {
        return this.isWithdrawal;
      },
    },

    transactionId: {
      type: String,
    },

    transactionUrl: {
      type: String,
    },

    error: {
      type: String,
    },
  },
  { _id: false },
);

const internalTransactionSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    amount: {
      type: mongoose.Types.Decimal128,
      required: true,
    },

    meta: {},

    status: {
      type: String,
      required: true,
      enum: Object.values(STATUSES),
    },

    withdrawal: {
      type: withdrawalSchema,
    },
  },
  { timestamps: true },
);

internalTransactionSchema.index({ account: 1, createdAt: -1 });
internalTransactionSchema.index({
  status: 1,
  "withdrawal.isWithdrawal": 1,
  "withdrawal.currencyId": 1,
});

internalTransactionSchema.method("isWithdrawal", function () {
  return !!this.withdrawal?.isWithdrawal;
});

internalTransactionSchema.method("requiresBlockchainOperations", function () {
  return this.isWithdrawal();
});

module.exports.InternalTransactionModel = mongoose.model(
  "InternalTransaction",
  internalTransactionSchema,
);

/**
 * @typedef {Object} TransactionLike
 * @property {mongoose.Types.Decimal128} amount
 * @property {STATUSES} status
 */

/**
 * Function that returns `true` if the given transaction should influence balance of
 * its `account` wallet.
 *
 * @param {TransactionLike}
 * @returns {boolean}
 */
module.exports.isTransactionCounted = function isTransactionCounted({
  amount,
  status = STATUSES.HOLD,
}) {
  if (status === STATUSES.DENIED) {
    return false;
  }

  if (status === STATUSES.HOLD && Number(amount) > 0) {
    return false;
  }

  return true;
};

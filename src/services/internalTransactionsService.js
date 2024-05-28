const assert = require("node:assert");
const mongoose = require("mongoose");
const {
  InternalTransactionModel,
  isTransactionCounted,
  STATUSES,
} = require("../models/InternalTransaction");
const { AccountModel } = require("../models/Account");
const {
  useMongodbSession,
  releaseDocuments,
} = require("../utils/useMongoSession");
const { Decimal } = require("decimal.js-light");

class InsufficientFundsError extends Error {}

module.exports.InsufficientFundsError = InsufficientFundsError;

/**
 * @typedef {Object} TransactionCreationParameters
 * @property {mongoose.Types.ObjectId} account
 * @property {string} amount
 * @property {Object<string, string>} meta
 */

/**
 * Creates transactions in database and modifies balances of related accounts.
 *
 * @param {TransactionCreationParameters[]} parameters
 * @param {mongoose.ClientSession} session mongodb session
 * @returns {Promise<InternalTransactionModel>}
 */
const createTransactions = (module.exports.createTransactions =
  async function createTransactions(parameters, session) {
    assert.ok(
      session,
      "Calling createTransactions method w/o session argument can lead to database inconsistencies. Use createTransactionsSafe() instead",
    );

    const transactions = await InternalTransactionModel.insertMany(parameters, {
      session,
    });

    const bulkOps = parameters
      .filter(isTransactionCounted)
      .map((transaction) => ({
        updateOne: {
          filter: {
            _id: transaction.account,
          },
          update: { $inc: { balance: transaction.amount } },
        },
      }));

    if (bulkOps.length > 0) {
      await AccountModel.bulkWrite(bulkOps, { session });
    }

    const negativeBalanceAccounts = await AccountModel.countDocuments({
      _id: { $in: parameters.map((p) => p.account) },
      balance: { $lt: 0 },
    }).session(session);

    if (negativeBalanceAccounts) {
      throw new InsufficientFundsError();
    }

    return transactions;
  });

/**
 * Helper for {@link createTransactions} that manages mongodb session.
 *
 * @param {TransactionCreationParameters[]} parameters
 * @returns {Promise<InternalTransactionModel>}
 */
module.exports.createTransactionsSafe = async function createTransactionsSafe(
  parameters,
) {
  const transactions = await useMongodbSession((session) =>
    createTransactions(parameters, session),
  );

  releaseDocuments(transactions);

  return transactions;
};

const TransactionNotFoundError =
  (module.exports.TransactionNotFoundError = class TransactionNotFoundError extends (
    Error
  ) {
    constructor() {
      super("Transaction not found.");
    }
  });

const UnexpectedTransactionStatusError =
  (module.exports.UnexpectedTransactionStatusError = class UnexpectedTransactionStatusError extends (
    Error
  ) {
    constructor() {
      super("Unexpected transaction status");
    }
  });

/**
 * Updates status of a transaction and changes balance of related account, if necessary.
 *
 * @param {mongoose.Types.ObjectId} id transaction id
 * @param {STATUSES} status new status
 * @param {mongoose.ClientSession} session mongodb session to execute updates in
 * @param {STATUSES[]?} allowedSourceStatuses change transaction status only if it's current status is one of these
 * @returns {Promise<void>}
 */
module.exports.updateTransactionStatus = async function updateTransactionStatus(
  id,
  status,
  session,
  allowedSourceStatuses = null,
) {
  assert.ok(
    session,
    "Session must be specified for updateTransactionStatus call.",
  );

  const prevState = await InternalTransactionModel.findOneAndUpdate(
    {
      _id: id,
      ...(allowedSourceStatuses?.length
        ? {
            status: { $in: allowedSourceStatuses },
          }
        : {}),
    },
    { status },
    { session },
  ).lean();

  if (!prevState) {
    if (await InternalTransactionModel.exists({ _id: id })) {
      throw new UnexpectedTransactionStatusError();
    } else {
      throw new TransactionNotFoundError();
    }
  }

  const wasCounted = isTransactionCounted(prevState);
  const isCounted = isTransactionCounted({ ...prevState, status });

  if (wasCounted === isCounted) {
    return;
  }

  /** @type {mongoose.Types.Decimal128}  */
  const amount = prevState.amount;

  await AccountModel.findOneAndUpdate(
    { _id: prevState.account },
    {
      $inc: {
        balance: isCounted
          ? amount
          : new mongoose.Types.Decimal128(
              new Decimal(amount.toString()).negated().toString(),
            ),
      },
    },
    { session },
  );
};

/**
 * Returns list of withdrawal transactions waiting for blockchain operations with given currency.
 *
 * @param {import('../blockchain/Currency')}
 * @returns {mongoose.Document[]}
 */
module.exports.getPendingWithdrawalTransactions =
  async function getPendingWithdrawalTransactions(currency) {
    return await InternalTransactionModel.find({
      status: { $in: [STATUSES.APPROVED, STATUSES.SEND_FAILED] },
      "withdrawal.isWithdrawal": true,
      "withdrawal.currencyId": currency.name,
    });
  };

/**
 * Returns list of withdrawal transactions for given currency in SENDING status.
 *
 * @param {import('../blockchain/Currency')} currency
 * @returns {mongoose.Document[]}
 */
module.exports.getSendingWithdrawalTransactions =
  async function getSendingWithdrawalTransactions(currency) {
    return await InternalTransactionModel.find({
      status: STATUSES.SENDING,
      "withdrawal.isWithdrawal": true,
      "withdrawal.currencyId": currency.name,
    });
  };

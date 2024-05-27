const { Decimal } = require("decimal.js-light");
const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { AccountModel } = require("../../models/Account");
const {
  STATUSES,
  InternalTransactionModel,
} = require("../../models/InternalTransaction");
const {
  createTransactionsSafe,
  updateTransactionStatus,
  TransactionNotFoundError,
  UnexpectedTransactionStatusError,
} = require("../../services/internalTransactionsService");
const {
  NotFound,
  InvalidArgument,
  FailedPrecondition,
} = require("../utils/errors");
const { authenticateCall } = require("../authenticate");
const mongoose = require("mongoose");
const { useMongodbSession } = require("../../utils/useMongoSession");
const { allCurrencies } = require("../../blockchain");

const ALLOWED_PAYMENT_INITIAL_STATUSES = new Set([
  STATUSES.PAID,
  STATUSES.HOLD,
]);

/**
 * @param {string?} rawId
 * @returns {mongoose.Types.ObjectId}
 * @throws {InvalidArgument}
 */
function parseTransactionId(rawId) {
  if (!rawId) {
    throw new InvalidArgument("Missing transaction ID");
  }

  try {
    return new mongoose.Types.ObjectId(rawId);
  } catch (_) {
    throw new InvalidArgument("Invalid transaction ID");
  }
}

function transactionToDetailedResponse(transaction, account) {
  if (!account) {
    account = transaction.account;
  }

  const isWithdrawal = !!transaction.withdrawal?.isWithdrawal;

  return {
    id: transaction._id.toString(),
    account: account.externalId,
    amount: transaction.amount.toString(),
    status: transaction.status,
    meta: Object.entries(transaction.meta ?? {}).map(([name, value]) => ({
      name,
      value,
    })),
    timestamp: transaction.createdAt.toISOString(),
    withdrawal: {
      isWithdrawal,
      ...(isWithdrawal
        ? {
            currencyId: transaction.withdrawal.currencyId,
            withdrawalAddress: transaction.withdrawal.withdrawalAddress,
            amount: transaction.withdrawal.amount.toString(),
            transactionId: transaction.withdrawal.transactionId,
            transactionUrl: transaction.withdrawal.transactionUrl,
            error: transaction.withdrawal.error,
          }
        : {}),
    },
  };
}

function metaToObject(meta) {
  const result = {};

  for (const metaEntry of meta) {
    result[metaEntry.name] = metaEntry.value;
  }

  return result;
}

module.exports.PayToAccount = unaryAsyncImpl(async (call) => {
  authenticateCall(call);

  const {
    request: { account, amount, status, meta = [] },
  } = call;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  if (!amount) {
    throw new InvalidArgument("Missing payment amount");
  }

  let parsedAmount;

  try {
    parsedAmount = new Decimal(amount);
  } catch (_) {
    throw new InvalidArgument("Invalid amount value");
  }

  if (parsedAmount.lessThanOrEqualTo(0)) {
    throw new InvalidArgument("Amount must be positive");
  }

  if (status && !ALLOWED_PAYMENT_INITIAL_STATUSES.has(status)) {
    throw new InvalidArgument("Illegal initial payment status");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new FailedPrecondition("Account not found");
  }

  const [transaction] = await createTransactionsSafe([
    {
      account: accountDoc._id,
      amount,
      status: status || STATUSES.PAID,
      meta: metaToObject(meta),
    },
  ]);

  return transactionToDetailedResponse(transaction, account);
});

module.exports.GetTransactionDetails = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const {
    request: { id },
  } = call;

  const parsedId = parseTransactionId(id);

  const transaction = await InternalTransactionModel.findOne({
    _id: parsedId,
  }).populate("account");

  if (!transaction) {
    throw new NotFound("Transaction not found");
  }

  return transactionToDetailedResponse(transaction);
});

module.exports.GetTransactionsList = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  const {
    offset,
    limit,
    account: accountId,
    includeStatuses = [],
    isWithdrawal,
  } = call.request;

  let account = null;

  if (accountId !== "") {
    account = await AccountModel.findOne({ externalId: accountId });

    if (!account) {
      throw new NotFound("Account not found");
    }
  }

  const cursor = InternalTransactionModel.aggregate([
    ...(account ? [{ $match: { account: account._id } }] : []),
    ...(includeStatuses.length
      ? [{ $match: { status: { $in: includeStatuses } } }]
      : []),
    ...(typeof isWithdrawal === "undefined"
      ? []
      : isWithdrawal
        ? [{ $match: { "withdrawal.isWithdrawal": true } }]
        : [{ $match: { "withdrawal.isWithdrawal": { $ne: true } } }]),
    { $sort: { createdAt: -1 } },
    ...(offset !== "0" ? [{ $skip: parseInt(offset) }] : []),
    ...(limit !== "0" ? [{ $limit: parseInt(limit) }] : []),
    ...(account
      ? []
      : [
          {
            $lookup: {
              from: "accounts",
              localField: "account",
              foreignField: "_id",
              as: "account",
            },
          },
          { $unwind: "$account" },
        ]),
  ]).cursor();

  for await (const doc of cursor) {
    if (call.cancelled) {
      await cursor.close();
      return;
    }

    yield transactionToDetailedResponse(doc, account);
  }
});

module.exports.ApproveTransaction = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { id } = call.request;

  const parsedId = parseTransactionId(id);

  const transaction = await InternalTransactionModel.findOne({ _id: parsedId });

  if (!transaction) {
    throw new NotFound("Transaction not found");
  }

  if (transaction.status !== STATUSES.HOLD) {
    throw new FailedPrecondition("Unexpected transaction status");
  }

  const approvedStatus = transaction.requiresBlockchainOperations()
    ? STATUSES.APPROVED
    : STATUSES.PAID;

  try {
    await useMongodbSession(async (session) =>
      updateTransactionStatus(parsedId, approvedStatus, session, [
        STATUSES.HOLD,
      ]),
    );
  } catch (e) {
    if (e instanceof UnexpectedTransactionStatusError) {
      throw new FailedPrecondition("Unexpected transaction status");
    }

    throw e;
  }

  return transactionToDetailedResponse(
    await InternalTransactionModel.findById(parsedId).populate("account"),
  );
});

module.exports.DenyTransaction = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { id } = call.request;

  const parsedId = parseTransactionId(id);

  const transaction = await InternalTransactionModel.findOne({ _id: parsedId });

  if (!transaction) {
    throw new NotFound("Transaction not found");
  }

  if (transaction.status !== STATUSES.HOLD) {
    throw new FailedPrecondition("Unexpected transaction status");
  }

  try {
    await useMongodbSession(async (session) =>
      updateTransactionStatus(parsedId, STATUSES.DENIED, session, [
        STATUSES.HOLD,
      ]),
    );
  } catch (e) {
    if (e instanceof UnexpectedTransactionStatusError) {
      throw new FailedPrecondition("Unexpected transaction status");
    }

    throw e;
  }

  return transactionToDetailedResponse(
    await InternalTransactionModel.findById(parsedId).populate("account"),
  );
});

module.exports.RequestWithdrawal = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const {
    account: accountId,
    currency: currencyName,
    rate: rawRate,
    amount: rawAmount,
    meta = [],
  } = call.request;

  if (!accountId) {
    throw new InvalidArgument("Account id is missing.");
  }

  const account = await AccountModel.findOne({ externalId: accountId });

  if (!account) {
    throw new NotFound("Account not found");
  }

  const currency = allCurrencies.get(currencyName);

  if (!currency) {
    throw new InvalidArgument("Unknown currency name");
  }

  const withdrawalAddress = account.withdrawalAddresses.find(
    (it) => it.network === currency.network.name,
  );

  if (!withdrawalAddress) {
    throw new FailedPrecondition(
      `Account has no withdrawal address for network ${currency.network.name}`,
    );
  }

  if (!rawRate) {
    throw new InvalidArgument("Rate is missing");
  }

  let rate;

  try {
    rate = new Decimal(rawRate);
  } catch (_) {
    throw new InvalidArgument("Invalid rate value");
  }

  let amount;

  if (rawAmount) {
    try {
      amount = new Decimal(rawAmount);
    } catch (_) {
      throw new InvalidArgument("Invalid amount");
    }

    if (amount.lessThanOrEqualTo(0)) {
      throw new InvalidArgument("Amount must be greater than 0");
    }

    if (amount.greaterThan(new Decimal(account.balance.toString()))) {
      throw new FailedPrecondition("Insufficient balance");
    }
  } else {
    amount = new Decimal(account.balance.toString());

    if (amount.lessThanOrEqualTo(0)) {
      throw new FailedPrecondition("Insufficient balance");
    }
  }

  const targetCurrencyAmount = amount.mul(rate);

  const [transaction] = await createTransactionsSafe([
    {
      account: account._id,
      amount: new mongoose.Types.Decimal128(amount.negated().toString()),
      status: STATUSES.HOLD,

      withdrawal: {
        isWithdrawal: true,
        currencyId: currency.name,
        amount: new mongoose.Types.Decimal128(targetCurrencyAmount.toString()),
        withdrawalAddress: withdrawalAddress.address,
      },

      meta: metaToObject(meta),
    },
  ]);

  return transactionToDetailedResponse(transaction, account);
});

const ALLOWED_RESTORE_SOURCE_STATUSES = [
  STATUSES.SEND_UNKNOWN_ERROR,
  STATUSES.SENDING,
];
const ALLOWED_RESTORE_TARGET_STATUSES = [
  STATUSES.SEND_FAILED,
  STATUSES.DENIED,
  STATUSES.MINED,
];

module.exports.RestoreWithdrawalStatus = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { id, status } = call.request;

  const parsedId = parseTransactionId(id);

  if (!ALLOWED_RESTORE_TARGET_STATUSES.includes(status)) {
    throw new InvalidArgument(
      `Illegall target status. Allowed statuses are: ${ALLOWED_RESTORE_TARGET_STATUSES.join(", ")}`,
    );
  }

  try {
    await useMongodbSession((session) =>
      updateTransactionStatus(
        parsedId,
        status,
        session,
        ALLOWED_RESTORE_SOURCE_STATUSES,
      ),
    );
  } catch (e) {
    if (e instanceof TransactionNotFoundError) {
      throw new NotFound("Transaction not found");
    }

    if (e instanceof UnexpectedTransactionStatusError) {
      throw new FailedPrecondition(
        `Transaction status is not ${ALLOWED_RESTORE_SOURCE_STATUSES.join(" or ")}`,
      );
    }

    throw e;
  }

  return transactionToDetailedResponse(
    await InternalTransactionModel.findById(parsedId).populate("account"),
  );
});

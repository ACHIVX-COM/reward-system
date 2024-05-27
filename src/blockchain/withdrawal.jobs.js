const { allCurrencies } = require(".");
const {
  getPendingWithdrawalTransactions,
  getSendingWithdrawalTransactions,
} = require("../services/internalTransactionsService");

/**
 * @param {import('./Currency')} currency
 */
async function runWithdrawalJob(currency) {
  const sendingTransactions = await getSendingWithdrawalTransactions(currency);

  console.log(
    `Found ${sendingTransactions.length} transactions in SENDING status for currency ${currency.name}`,
  );

  if (sendingTransactions.length) {
    await currency.processSentWithdrawalTransactions(sendingTransactions);
  }

  const pendingTransactions = await getPendingWithdrawalTransactions(currency);

  console.log(
    `Found ${pendingTransactions.length} pending withdrawal transaction(s) for currency ${currency.name}`,
  );

  if (pendingTransactions.length > 0) {
    await currency.processWithdrawalTransactions(pendingTransactions);
  }
}

module.exports.getJobs = function getJobs() {
  return [...allCurrencies.entries()].map(([name, currency]) => ({
    name: `withdraw@${name}`,
    description: `Process withdrawal transactions for currency ${currency.name}`,
    run: () => runWithdrawalJob(currency),
  }));
};

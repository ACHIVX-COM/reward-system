/** @abstract */
module.exports = class Currency {
  /**
   * Name of currency type as it will be used in currencies configuration file.
   *
   * @abstract
   */
  static typeName = "<unknown>";

  constructor({ name, network }) {
    /** @type {string} */
    this.name = name;

    /** @type {import('./Network')} */
    this.network = network;
  }

  /**
   * Perform some optional checks on currency configuration.
   *
   * @returns {boolean} - true if there are any errors in configuration
   */
  async checkConfiguration() {}

  /**
   * Returns amount of this currency available for withdrawal.
   *
   * @returns {string}
   * @abstract
   */
  async getMasterWalletBalance() {
    throw new Error("Not implemented");
  }

  /**
   * Process transactions in APPROVED or SEND_FAILED statuses.
   *
   * This method should try to send these transactions to the blockchain and change their statuses to one of the following:
   * - MINED - if transaction was sent and executed successfully
   * - SENDING - if transaction was sent, no error has happened but it's not yet possible to tell if it was processed successfully
   * - SEND_FAILED - if transaction could not be sent because of an error
   * - SEND_UNKNOWN_ERROR - if error has happened while sending the transaction and it is not known if the transaction was actually sent
   *
   * @param {import('mongoose').Document[]} _transactions
   * @abstract
   */
  async processWithdrawalTransactions(_transactions) {
    throw new Error("Not implemented");
  }

  /**
   * Process transactions in SENDING status.
   *
   * This method should check status of transactions in blockchain and may change their statuses to one of the following:
   * - MINED - if transaction was executed successfully
   * - SEND_FAILED - if transaction has failed with known recoverable error
   * - SEND_UNKNOWN_ERROR - if transaction has failed with an unknown error and a manual check of it's status is necessary
   *
   * It may also keep the transaction in SENDING status if it is still not known if it has succeed.
   *
   * @param {import('mongoose').Document[]} _transactions
   * @abstract
   */
  async processSentWithdrawalTransactions(_transactions) {
    throw new Error("Not implemented");
  }
};

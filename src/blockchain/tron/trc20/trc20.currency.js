const assert = require("node:assert");
const { Decimal } = require("decimal.js-light");
const ms = require("ms");
const { isBefore } = require("date-fns/isBefore");
const Currency = require("../../Currency");
const TronNetwork = require("../tron.network");
const TronWeb = require("tronweb");
const trc20Abi = require("./abi/trc20.json");
const trc20ExtAbi = require("./abi/trc20-impl.json");
const {
  STATUSES,
  InternalTransactionModel,
} = require("../../../models/InternalTransaction");
const { subMilliseconds } = require("date-fns");

/**
 * A TRC20 token, potentially with batch transaction sending extensions, like ACHIVX.
 */
module.exports = class TRC20Currency extends Currency {
  static typeName = "TRC20";

  constructor({ name, config, network }) {
    super({ name, network });

    assert.ok(
      network instanceof TronNetwork,
      `Network for TRC20 token ${name} must be a tron network`,
    );

    /** @type {Number} */
    this._decimals = config.decimals ?? 6;

    this._trc20Contract = network.tronWeb.contract(trc20Abi, config.address);

    if (config.extImplAddress) {
      this._trc20ExtContract = network.tronWeb.contract(
        trc20ExtAbi,
        config.extImplAddress,
      );
    } else {
      this._trc20ExtContract = null;
    }

    this._feeLimit = config.feeLimit;
    this._stuckTransactionResendTimeoutMs = ms(
      config.stuckTransactionResendTimeout ?? "1 day",
    );
  }

  async checkConfiguration() {
    let hasErrors = false;

    console.log(
      `- Master wallet address is ${this.network.masterWalletAddress}`,
    );

    try {
      const contractDecimalsResponse = await this._trc20Contract
        .decimals()
        .call();

      if (contractDecimalsResponse.toString() != this._decimals.toString()) {
        hasErrors = true;
        console.log(
          `! Decimals number is misconfigured. It is set to ${this.decimals} but should be ${contractDecimalsResponse}`,
        );
      } else {
        console.log(
          `- Decimals number (${this._decimals}) is configured correctly`,
        );
      }
    } catch (e) {
      hasErrors = true;
      console.log("! Error calling main contract:");
      console.log(e);
    }

    if (this._trc20ExtContract) {
      try {
        const [extSupply, mainSupply] = await Promise.all([
          this._trc20ExtContract.totalSupply().call(),
          this._trc20Contract.totalSupply().call(),
        ]);

        console.log(`- total supply is ${mainSupply}`);

        if (extSupply.toString() !== mainSupply.toString()) {
          hasErrors = true;
          console.log(`! Extension contract is set but does not seem correct`);
        } else {
          console.log(`- Extension contract is set and seems to be correct`);
        }
      } catch (e) {
        hasErrors = true;
        console.log("! Error checking extension contract");
        console.log(e);
      }
    } else {
      console.log(
        `- Token does not support batch transactions extension.\n\tStandard TRC20 transactions will be used to withdraw tokens.\n\tThat's inefficient in case of large numbers of transactions.`,
      );
    }

    return hasErrors;
  }

  async getMasterWalletBalance() {
    const balanceResponse = await this._trc20Contract
      .balanceOf(TronWeb.address.toHex(this.network.masterWalletAddress))
      .call();

    return new Decimal(balanceResponse.balance.toString())
      .div(10 ** this._decimals)
      .toString();
  }

  async _checkTransaction(transactionId) {
    const response =
      await this.network.tronWeb.trx.getTransactionInfo(transactionId);

    console.log(`Response for transaction ${transactionId}:`, response);

    if (!Object.keys(response).length) {
      return { done: false };
    }

    if (response.result && response.result === "FAILED") {
      return {
        done: true,
        success: false,
        error: `${JSON.stringify(response)}`,
      };
    }

    return { done: true, success: true };
  }

  async _waitForTransactionResult(
    transactionId,
    iterations = 10,
    delay = 10000,
  ) {
    for (;;) {
      const status = await this._checkTransaction(transactionId);

      if (status.done) {
        return status;
      }

      if (--iterations <= 0) {
        return status;
      }

      await new Promise((res) => setTimeout(res, delay));
    }
  }

  async _createSignedStandardTransaction(address, amount) {
    const tronWeb = this.network.tronWeb;

    const { transaction } =
      await tronWeb.transactionBuilder.triggerSmartContract(
        TronWeb.address.toHex(this._trc20Contract.address),
        "transfer(address,uint256)",
        { feeLimit: this._feeLimit },
        [
          { type: "address", value: address },
          { type: "uint256", value: amount },
        ],
        TronWeb.address.toHex(this.network.masterWalletAddress),
      );

    return tronWeb.trx.sign(transaction, tronWeb.defaultPrivateKey);
  }

  async _sendStandardTransaction(transaction) {
    const amount = new Decimal(transaction.withdrawal.amount.toString())
      .mul(10 ** this._decimals)
      .toInteger()
      .toNumber();

    // TODO: Check balance (?)

    const signedTransaction = await this._createSignedStandardTransaction(
      transaction.withdrawal.withdrawalAddress,
      amount,
    );

    await transaction.updateOne({
      "withdrawal.transactionId": signedTransaction.txID,
      "withdrawal.transactionUrl": this.network.formatTransactionUrl(
        signedTransaction.txID,
      ),
      status: STATUSES.SENDING,
    });

    try {
      const response =
        await this.network.tronWeb.trx.sendRawTransaction(signedTransaction);

      console.log(response);

      if (response.code) {
        throw new Error(
          `Tronweb error ${response.code}: ${TronWeb.toUtf8(response.message)}`,
        );
      }

      const { done, success, error } = await this._waitForTransactionResult(
        signedTransaction.txID,
      );

      if (done) {
        const status = success ? STATUSES.MINED : STATUSES.SEND_FAILED;

        await transaction.updateOne({
          $set: {
            status,
            "withdrawal.error": error ?? null,
          },
        });
      }
    } catch (e) {
      await transaction.updateOne({
        $set: {
          "withdrawal.error": `${e}`,
          status: STATUSES.SEND_UNKNOWN_ERROR,
        },
      });

      throw e;
    }
  }

  async _createSignedBatchTransaction(txs) {
    const parameters = [
      { type: "address[]", value: txs.map((tx) => tx.toAddress) },
      { type: "uint256[]", value: txs.map((tx) => tx.amount) },
    ];

    const tronWeb = this.network.tronWeb;

    const { transaction } =
      await tronWeb.transactionBuilder.triggerSmartContract(
        TronWeb.address.toHex(this._trc20ExtContract.address),
        "batchTransfer(address[],uint256[])",
        { feeLimit: this._feeLimit },
        parameters,
        TronWeb.address.toHex(this.network.masterWalletAddress),
      );

    return tronWeb.trx.sign(transaction, tronWeb.defaultPrivateKey);
  }

  async _sendBatchTransaction(transactions) {
    const payload = transactions.map((transaction) => ({
      toAddress: transaction.withdrawal.withdrawalAddress,
      amount: new Decimal(transaction.withdrawal.amount.toString())
        .mul(10 ** this._decimals)
        .toInteger()
        .toNumber(),
    }));

    // TODO: Check balance (?)

    const signedTransaction = await this._createSignedBatchTransaction(payload);

    await InternalTransactionModel.updateMany(
      { _id: { $in: transactions.map((it) => it._id) } },
      {
        $set: {
          "withdrawal.transactionId": signedTransaction.txID,
          "withdrawal.transactionUrl": this.network.formatTransactionUrl(
            signedTransaction.txID,
          ),
          status: STATUSES.SENDING,
        },
      },
    );

    try {
      const response =
        await this.network.tronWeb.trx.sendRawTransaction(signedTransaction);

      console.log(response);

      if (response.code) {
        throw new Error(
          `Tronweb error ${response.code}: ${TronWeb.toUtf8(response.message)}`,
        );
      }

      const { done, success, error } = await this._waitForTransactionResult(
        signedTransaction.txID,
      );

      if (done) {
        const status = success ? STATUSES.MINED : STATUSES.SEND_FAILED;

        await InternalTransactionModel.updateMany(
          { _id: { $in: transactions.map((it) => it._id) } },
          {
            $set: {
              status,
              "withdrawal.error": error ?? null,
            },
          },
        );
      }
    } catch (e) {
      await InternalTransactionModel.updateMany(
        { _id: { $in: transactions.map((it) => it._id) } },
        { $set: { status: STATUSES.SEND_UNKNOWN_ERROR } },
      );

      throw e;
    }
  }

  async processWithdrawalTransactions(transactions) {
    if (this._trc20ExtContract) {
      await this._sendBatchTransaction(transactions);
    } else {
      for (const transaction of transactions) {
        await this._sendStandardTransaction(transaction);
      }
    }
  }

  async processSentWithdrawalTransactions(transactions) {
    const checkResults = new Map();

    const resendTransactionsStuckSince = subMilliseconds(
      new Date(),
      this._stuckTransactionResendTimeoutMs,
    );

    for (const transaction of transactions) {
      if (isBefore(transaction.updatedAt, resendTransactionsStuckSince)) {
        console.log(
          `Transaction ${transaction.id} is stuck in SENDING status for too long. Will try to re-send it.`,
        );

        await transaction.updateOne({
          $set: {
            status: STATUSES.SEND_FAILED,
            "withdrawal.error":
              "Can not confirm if transaction is succeed or failed. Assuming it was not sent. Will re-send.",
          },
        });

        continue;
      }

      const txId = transaction.withdrawal.transactionId;
      assert.ok(txId, "SENDING transaction must have a transaction id");

      let checkResult = checkResults.get(txId);

      if (!checkResult) {
        checkResult = await this._checkTransaction(txId);
        checkResults.set(txId, checkResult);
      }

      if (!checkResult.done) {
        console.log(`Status of transaction ${transaction.id} not known yet.`);
        continue;
      }

      // TODO: Check contract's returned value for standard TRC20 contracts
      if (checkResult.success) {
        console.log(`Transaction ${transaction.id} mined successfully.`);

        await transaction.updateOne({ $set: { status: STATUSES.MINED } });
      } else {
        console.log(`Transaction ${transaction.id} failed`);

        await transaction.updateOne({
          $set: {
            status: STATUSES.SEND_FAILED,
            "withdrawal.error": checkResult.error ?? null,
          },
        });
      }
    }
  }
};

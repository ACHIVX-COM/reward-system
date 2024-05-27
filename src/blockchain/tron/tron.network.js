const TronWeb = require("tronweb");
const Network = require("../Network");

module.exports = class TronNetwork extends Network {
  static typeName = "Tron";

  isValidAddress(address) {
    return TronWeb.isAddress(address);
  }

  constructor({ name, config }) {
    super({ name });

    const privateKey =
      process.env[config.privateKeyEnv ?? "TRON_PRIVATE_KEY"] ??
      config.tronWebConfig.privateKey;

    this.masterWalletAddress =
      TronWeb.address.fromPrivateKey(privateKey) || null;

    this.tronWeb = new TronWeb({
      ...config.tronWebConfig,
      privateKey,
    });

    this._tronscanHostname = config.tronscanHostname ?? "https://tronscan.org";

    this._minStakedForEnergy = config.minSunStakedForEnergy ?? 1_000_000_000;
  }

  /**
   * Create URL of transaction in transaction explorer (tronscan).
   *
   * @param {string} transactionId
   * @returns {string}
   */
  formatTransactionUrl(transactionId) {
    return `${this._tronscanHostname}/#/transaction/${transactionId}`;
  }

  /**
   * Checks amount of frozen TRX, tries to freeze some TRX if it is below configured limit.
   */
  async ensureStakedTRX() {
    if (this._minStakedForEnergy <= 0) {
      console.log("TRX freezing is disabled.");
      return;
    }

    const account = await this.tronWeb.trx.getAccount(this.masterWalletAddress);

    const { amount: stakedForEnergy = 0 } = account.frozenV2.find(
      (it) => it.type === "ENERGY",
    );

    if (stakedForEnergy >= this._minStakedForEnergy) {
      console.log(
        `There is enough funds (${stakedForEnergy}) staked for energy.`,
      );
      return;
    }

    const toStake = Math.min(
      account.balance * 1_000_000,
      this._minStakedForEnergy - stakedForEnergy,
    );

    if (toStake <= 0) {
      throw new Error("Too low TRX balance");
    }

    if (toStake + stakedForEnergy < this._minStakedForEnergy) {
      console.warn(
        `There are some TRX (${toStake} SUN) to freeze but not enough to reach configured limit of ${this._minStakedForEnergy} SUN`,
      );
    }

    const transaction = await this.tronWeb.transactionBuilder.freezeBalanceV2(
      toStake,
      "ENERGY",
      this.masterWalletAddress,
    );
    const signed = await this.tronWeb.trx.sign(
      transaction,
      this.tronWeb.defaultPrivateKey,
    );
    await this.tronWeb.trx.sendRawTransaction(signed);
  }
};

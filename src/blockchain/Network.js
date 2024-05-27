/**
 * Represents a network/blockchain, e.g. Tron, Ethereum, Bitcoin, etc.
 *
 * There may be multiple instances of one network subclass, e.g. different instances of Ethereum network may represent ethereum mainnet and different testnets.
 *
 * There may be multiple currencies working on single network.
 * E.g. on Ethereum network there may be the main ETH currency and multiple ERC20 tokens.
 * However a single currency cannot work with multiple networks.
 * So if, for example, there is a token that has bots ERC20 and TRC20 contracts, there should be separate currencies created to represent those contracts.
 *
 * @abstract
 */
module.exports = class Network {
  /**
   * Name of network type as it will be used in networks configuration file.
   *
   * @abstract
   */
  static typeName = "<unknown>";

  /**
   * Returns true iff given string represents a valid address in this network.
   *
   * @param {string} _address
   * @abstract
   */
  isValidAddress(_address) {
    throw new Error("Not implemented");
  }

  constructor({ name }) {
    /** @type {string} */
    this.name = name;
  }
};

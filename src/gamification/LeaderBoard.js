/**
 * @typedef {Object} Leader
 * @property {string} externalId
 * @property {number} score
 */

/** @abstract */
module.exports = class LeaderBoard {
  /** @type {string} */
  static typeName = "<unknown>";

  constructor({ name }) {
    /** @type {string} */
    this.name = name;
  }

  /**
   * @returns {AsyncGenerator<Leader>}
   */
  // eslint-disable-next-line require-yield
  async *getLeaders() {
    throw new Error("Not implemented");
  }
};

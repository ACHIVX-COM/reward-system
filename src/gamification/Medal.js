/**
 * @typedef {Object} MedalEligibility
 * @property {import('mongoose').Types.ObjectId} account
 * @property {number} rank
 */

/** @abstract */
module.exports = class Medal {
  /**
   * @type {string}
   */
  static typeName = "<unknown>";

  constructor({ name }) {
    /** @type {string} */
    this.name = name;
  }

  /**
   * Find users that should have this medal.
   *
   * @returns {AsyncGenerator<MedalEligibility>}
   * @abstract
   */
  // eslint-disable-next-line require-yield
  async *findEligible() {
    throw new Error("Not implemented");
  }

  /**
   * Find users that do have this medal but do no longer deserve it.
   *
   * @returns {AsyncGenerator<import('mongoose').Types.ObjectId>}
   * @abstract
   */
  // eslint-disable-next-line require-yield
  async *findUnworthy() {
    throw new Error("Not implemented");
  }
};

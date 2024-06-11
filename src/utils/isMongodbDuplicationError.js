/**
 * @param {Error} e
 * @returns true if the given error is a mongodb duplicate key error
 */
module.exports = function isMongodbDuplicationError(e) {
  return e.name === "MongoServerError" && e.code === 11000;
};

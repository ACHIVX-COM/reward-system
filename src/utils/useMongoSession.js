const mongoose = require("mongoose");

/**
 * Executes given function within a mongodb transaction.
 *
 * The function may get called multiple times if conflict happens in database.
 *
 * It's a bad idea to use {@link Promise.all} with any mongo operations inside of the {@link task} function:
 * if one of such operations is a write operation and another one fails the way the call will be retried,
 * then the first operation may be performed twice within next transaction attempt.
 *
 * @param {Function} task the function to execute
 * @returns {*} the value returned by the last call of {@link task}
 */
module.exports.useMongodbSession = async function useMongodbSession(task) {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(task, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
  } finally {
    session.endSession();
  }
};

/**
 * Detaches given mongoose documents from mongodb session they were attached to.
 *
 * @param  {...mongoose.Document} documents
 */
module.exports.releaseDocuments = function releaseDocuments(...documents) {
  documents.filter((d) => d.$session).forEach((d) => d.$session(null));
};

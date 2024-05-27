const { Unauthenticated } = require("./utils/errors");

const authToken = process.env.AUTH_TOKEN;

if (!authToken) {
  throw new Error("AUTH_TOKEN variable is not set");
}

/**
 *
 * @param {object} call
 * @param {import('@grpc/grpc-js').Metadata} call.metadata
 */
module.exports.authenticateCall = async function (call) {
  const authValues = call.metadata.get("authentication");

  if (authValues.length === 0) {
    throw new Unauthenticated("Authentication token is missing");
  }

  if (authValues[0] !== authToken) {
    throw new Unauthenticated("Invalid authentication token");
  }
};

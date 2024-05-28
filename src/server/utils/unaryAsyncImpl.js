/**
 * @callback UnaryAsyncHandler
 * @param {import('@grpc/grpc-js').ServerUnaryCall<any, any>}
 * @returns {Promise<any>}
 */

/**
 * Creates a unary GRPC call handler from an asynchronous function.
 *
 * The handler will call the function on every GRPC call.
 * Value returned by the function will be treated as call's response.
 * Thrown errors will make the call finish with an error.
 * It's preferable to throw errors of types from [errors module](./errors.js).
 *
 * @param {UnaryAsyncHandler} handler
 * @returns
 */
module.exports = (handler) => async (call, callback) => {
  let response = null;

  try {
    response = await handler(call);
  } catch (err) {
    console.error(err);
    callback(err);
    return;
  }

  callback(null, response);
};

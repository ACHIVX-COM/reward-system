/**
 * @param {AsyncGenerator<T>} source
 * @param {number} size
 * @returns {AsyncGenerator<T[]>}
 */
module.exports = async function* asyncGenChunks(source, size = 256) {
  let chunk = [];

  for await (const item of source) {
    chunk.push(item);

    if (chunk.length >= size) {
      yield chunk;
      chunk = [];
    }
  }

  if (chunk.length) {
    yield chunk;
  }
};

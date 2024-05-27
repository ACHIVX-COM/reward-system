module.exports = (handler) => async (call) => {
  try {
    const generator = handler(call);

    for await (const response of generator) {
      if (call.cancelled) {
        break;
      }

      call.write(response);
    }
  } catch (e) {
    console.error(e);
    call.emit("error", e);
  }

  call.end();
};

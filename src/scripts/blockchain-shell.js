/* A script that creates environment containing blockchain-related variables and starts a REPL
 * in that environment.
 * Useful for debugging blockchain operations and for performing some operations manually.
 *
 * Optionally receives single argument - a name of a blockchain network or currency to provide
 * easier access to.
 */
const repl = require("node:repl");
const { allNetworks, allCurrencies } = require("../blockchain");

if (process.argv.length > 3) {
  console.error("Too much args");
  process.exit(1);
}

global.nets = allNetworks;
global.curs = allCurrencies;

console.log(
  "Use nets variable to access blockchain networks and curs variable to access currencies.",
);

if (process.argv.length === 3) {
  const name = process.argv[2];

  if (allNetworks.has(name)) {
    global.net = allNetworks.get(name);
    console.log(`Use net variable to access ${name} network.`);
  } else if (allCurrencies.has(name)) {
    global.cur = allCurrencies.get(name);
    global.net = global.cur.network;
    console.log(
      `Use cur variable to access ${name} currency and net variable to access ${global.net.name} network`,
    );
  }
}

repl.start();

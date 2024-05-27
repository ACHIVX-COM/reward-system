const assert = require("node:assert");
const requireAll = require("require-all");
const Network = require("./Network");
const Currency = require("./Currency");

const networkTypes = new Map();

requireAll({
  dirname: __dirname,
  filter: /.*\.network\.js$/,
  excludeDirs: /^(\.|node_modules$)/,
  resolve(module) {
    assert.ok(
      module.prototype instanceof Network,
      "Default export of a network module must be a Network subclass",
    );

    networkTypes.set(module.typeName, module);
  },
});

const currencyTypes = new Map();

requireAll({
  dirname: __dirname,
  filter: /.*\.currency\.js$/,
  excludeDirs: /^(\.|node_modules$)/,
  resolve(module) {
    assert.ok(
      module.prototype instanceof Currency,
      "Default export of a currency module must be a Currency subclass",
    );

    currencyTypes.set(module.typeName, module);
  },
});

const networksConfig = require(
  process.env.NETWORKS_CONFIG_PATH ?? `../../config/networks.json`,
);

/**
 * @type {Map<string, Network>}
 */
const allNetworks = (module.exports.allNetworks = new Map(
  Object.entries(networksConfig).map(([name, config]) => {
    assert.ok(config.type, `Network type must be set for network ${name}`);
    const Network = networkTypes.get(config.type);
    assert.ok(
      Network,
      `Network ${name} type (${config.type}) must be a valid network type - one of ${[...networkTypes.keys()].join(", ")}`,
    );

    return [name, new Network({ name, config })];
  }),
));

const currenciesConfig = require(
  process.env.CURRENCIES_CONFIG_PATH ?? `../../config/currencies.json`,
);

/**
 * @type {Map<string, Currency>}
 */
module.exports.allCurrencies = new Map(
  Object.entries(currenciesConfig).map(([name, config]) => {
    assert.ok(
      config.type,
      `Currency type must be defined for currency ${name}`,
    );

    assert.ok(config.network, `Network must be defined for currency ${name}`);

    const network = allNetworks.get(config.network);
    const Currency = currencyTypes.get(config.type);

    assert.ok(
      network,
      `Network name (${config.network}) for currency ${name} must be a valid network name - one of ${[...allNetworks.keys()].join(", ")}`,
    );
    assert.ok(
      Currency,
      `Currency ${name} type (${config.type}) must be a valid currency type - one of ${[...currencyTypes.keys()].join(", ")}`,
    );

    return [name, new Currency({ network, name, config })];
  }),
);

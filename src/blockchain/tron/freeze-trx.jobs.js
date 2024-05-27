const { allNetworks } = require("..");
const TronNetwork = require("./tron.network");

module.exports.getJobs = function getJobs() {
  return [...allNetworks.values()]
    .filter((it) => it instanceof TronNetwork)
    .map((net) => ({
      name: `freeze-trx@${net.name}`,
      description: `Freezes TRX for resources in ${net.name} network`,
      run: () => net.ensureStakedTRX(),
    }));
};

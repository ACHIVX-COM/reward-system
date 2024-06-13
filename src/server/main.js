require("dotenv-load")();

const { promisify } = require("util");
const grpc = require("@grpc/grpc-js");
const path = require("node:path");
const { ReflectionService } = require("@grpc/reflection");
const {
  connect: connectDb,
  disconnect: disconnectDb,
} = require("../components/mongoose");
const protoLoader = require("@grpc/proto-loader");

const accountRPCs = require("./rpcs/account");
const actionsRPCs = require("./rpcs/actions");
const blockchainCurrenciesRPCs = require("./rpcs/blockchainCurrencies");
const blockchainNetworksRPCs = require("./rpcs/blockchainNetworks");
const transactionsRPCs = require("./rpcs/transactions");
const jobsRPCs = require("./rpcs/jobs");

const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, "../../protocols/index.proto"),
  {
    includeDirs: [path.resolve(__dirname, "../..")],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  },
);

const grpcPackage = grpc.loadPackageDefinition(packageDefinition);

/**
 * @param {grpc.Server} server
 */
function addServices(server) {
  server.addService(grpcPackage.achivx.accounts.Accounts.service, accountRPCs);
  server.addService(grpcPackage.achivx.actions.Actions.service, actionsRPCs);
  server.addService(
    grpcPackage.achivx.transactions.Transactions.service,
    transactionsRPCs,
  );
  server.addService(
    grpcPackage.achivx.blockchain.Currencies.service,
    blockchainCurrenciesRPCs,
  );
  server.addService(
    grpcPackage.achivx.blockchain.Networks.service,
    blockchainNetworksRPCs,
  );
  server.addService(grpcPackage.achivx.jobs.Jobs.service, jobsRPCs);
}

async function main() {
  await connectDb();

  try {
    const server = new grpc.Server();

    addServices(server);
    new ReflectionService(packageDefinition).addToServer(server);

    const port = await promisify(server.bindAsync.bind(server))(
      process.env.BIND_ADDRESS ?? "0.0.0.0:50051",
      grpc.ServerCredentials.createInsecure(),
    );

    console.log(`Server listening on port ${port}`);

    async function onSignal(signal) {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);

      console.error(`Received ${signal}. Terminating server...`);

      await promisify(server.tryShutdown.bind(server));
      server.forceShutdown();

      console.log("Disconnecting from database...");

      await disconnectDb();

      console.log("Shutdown completed.");
    }
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  } catch (e) {
    try {
      await disconnectDb();
    } catch (e) {
      console.error(
        "Error disconnecting database while handling startup error.",
        e,
      );
    }

    throw e;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

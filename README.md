# ACHIVX Reward System

This project provides a service that:

- maitains balance of internal tokens (stored in database) and transaction history for each account
- enables withdrawal of internal tokens to real blockchain wallets

The functionality is exposed as set of gRPC procedures.
See [documentation](./doc/integration.md) and [protocol definitions](./protocols/) for details.

The service is not meant to be exposed directly to internet.
Instead, your backend is expected to serve as a middleware between users and the service.

## Running

### Setting up environment

The service uses a MongoDB database, so you should provide a MongoDB cluster.
For production deployment it is recommended to have a full cluster with at least 3 replicas.
For development purposes a standalone server will be ok if only it runs in replica set mode.
There is a [docker-compose](./dev-helpers/docker-compose.yaml) file that starts a properly configured mongodb instance and optionally starts the service itself.

You should also provide a authentication token and private keys for all active blockchains.

See [documentation on configuration parameters](./doc/configuration.md) for more details.

### Using docker-compose

There is a [docker-compose](./dev-helpers/docker-compose.yaml) file that enables you to run an instance of the service along with a standalone mongodb instance:

```sh
docker compose --profile build --env-file=.env.local up
```

*`.env.local` file should contain all necessary environment variables, [see list of environment variables](./doc/configuration.md).*

This configuration is not recommended for production deployments.

### Running from source

After clonning the source, setting up MongoDB and configuring environment variables in `.env.local`, the following commands will be enough to start the service:

```sh
# Use correct node.js version
nvm use
# Install dependencies
npm ci
# Start RPC server
npm run serve
```

### Running jobs

The service uses some batch jobs that should be executed periodically.
In order to use full functionality of ACHIVX Reward System, you should launch them on schedule.
See [jobs documentation](./doc/jobs.md) for more details.

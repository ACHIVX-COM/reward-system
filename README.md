# ACHIVX Reward System

[![Docker build](https://github.com/ACHIVX-COM/reward-system/actions/workflows/docker-master.yml/badge.svg)](https://github.com/ACHIVX-COM/reward-system/actions/workflows/docker-master.yml)

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

### Using docker image

There is a [achivx/reward-system](https://hub.docker.com/r/achivx/reward-system) docker image published on dockerhub.

```sh
docker run -e '...' achivx/reward-system:latest
```

Container environment (set using `-e` parameter in the example) must contain all required [environment variables](./doc/configuration.md#environment-variables).

The following tags are available:
- `master` is an image built from master branch of [this repository](https://github.com/ACHIVX-COM/reward-system).
  It is not guaranteed to always be fully functional
- `latest` is an image of the latest release
- specific version tags, e.g. `0.1.0` are images built for specific [releases](https://github.com/ACHIVX-COM/reward-system/releases)

### Using docker-compose

There is a [docker-compose](./dev-helpers/docker-compose.yaml) file that enables you to run an instance of the service along with a standalone mongodb instance:

```sh
docker compose --profile build --env-file=.env.local up
```

*`.env.local` file should contain all necessary environment variables, [see list of environment variables](./doc/configuration.md).*

Profile `build` will build the service image from sources.
Add flag `--build` to `up` subcommand to force image rebuild from sources if something was/could be changed.
If you want to use an image pulled from dockerhub, use profile `prebuilt`.

This configuration is not recommended for production deployments.
It's purpose is to provide a quick start in development environment.

### Running from source

After clonning the source, installing Node.js, setting up MongoDB and configuring environment variables in `.env.local`, the following commands will be enough to start the service:

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

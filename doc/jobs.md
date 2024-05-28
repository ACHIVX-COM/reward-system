# Jobs

The service needs to run some batch jobs.
This includes jobs that collect withdrawal transactions from database, send them to blockchains and synchronize statuses of transactions in database with transactions in blockchain.

Some of these jobs (including those handling withdrawal transactions) should be ran periodically.
The service does not provide any means to schedule the jobs.
It's your responsibility to invoke them with schedule you prefer.

## Running jobs

There are two ways to run them - using scripts of by calling a RPC.

### Using scripts

There are scripts that enable managing jobs using shell commands.
This approach may be preferable:
- if you run the service from sources on dedicated server/vm.
  In this scenario it's possible to run jobs using cron or any other scheduler.
- if the service runs as a docker container in Kubernetes.
  It is possible to create a CronJob with corresponding command for each job.

The following command in root of service folder will show list of available jobs:

```
$ npm run job-list

- freeze-trx@Tron-Main  Freezes TRX for resources in Tron-Main network
- withdraw@ACHIVX_Tron  Process withdrawal transactions for currency ACHIVX_Tron
```

Then a job can be launched using the following command:

```
$ npm run job withdraw@ACHIVX_Tron

Found 0 transactions in SENDING status for currency ACHIVX_Tron
Found 0 pending withdrawal transaction(s) for currency ACHIVX_Tron
```

### Using RPC

Sometimes it isn't possible/convenient to run a command in context of the service.
E.g. if it runs in a standalone Docker container and using `docker exec` is not convenient for some reason.
For such cases [there are RPCs](../protocols/jobs.proto) to list/invoke jobs using running service process.

Example of invoking these procedures using `grpcurl`:

```
$ grpcurl --rpc-header "authentication: <token>" --plaintext localhost:50051 achivx.jobs.Jobs/ListJobs                          
{
  "name": "freeze-trx@Tron-Main",
  "description": "Freezes TRX for resources in Tron-Main network",
  "state": "DONE",
  "stateTime": "2024-05-21T10:03:08.050Z"
}
{
  "name": "withdraw@ACHIVX_Tron",
  "description": "Process withdrawal transactions for currency ACHIVX_Tron",
  "state": "DONE",
  "stateTime": "2024-05-22T11:51:04.255Z",
}
```

```
$ grpcurl --rpc-header 'authentication: <token>' --plaintext -d '{"name":"withdraw@ACHIVX_Tron"}' localhost:50051 achivx.jobs.Jobs/RunJob 
{}
```

## Synchronization

The system ensures that there are never two instances of one job running on the same database.
It uses documents in database collection `jobstatuses` for this purpose.

This mechanism has a side-effect.
It happens if a job fails the way it cannot report it's completion status to database.
Any next attempts to run the same job again will fail in such condition.

It can be fixed in two possible ways:
- you can change `state` field in corresponding document manually
- or just wait for 7 days after failed attempt to start the job.
  The system will ignore running job status if it's running for more than 7 days and will allow to start it again.

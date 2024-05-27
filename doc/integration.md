# Integrating ACHIVX Reward System with your backend

This document describes possible interactions between backend of your system and ACHIVX Reward System server instance.

Examples of gRPC procedure calls use [grpcurl](https://github.com/fullstorydev/grpcurl).
However, it is recommended to use a gRPC client library for your language of choice for actual integration (unless your backend is written in bash).
An incomplete list of available gRPC client libraries is available in [official gRPC documentation](https://grpc.io/docs/languages/).
The protocols for ACHIVX Reward System are available in [protocols folder of this repository](../protocols/).

Examples also assume that the server is available at `localhost:50051` and the authentication token is stored in `AUTH_TOKEN` environment variable.

## Managing accounts

Most of other procedures require ACHIVX Reward System to have information about user accounts present in your system.
An account can be added to the ACHIVX Reward System by calling `achivx.accounts.Accounts/UpsertAccount` procedure:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" -plaintext -d '{"id": "1"}' localhost:50051 achivx.accounts.Accounts/UpsertAccount     
{
  "id": "1",
  "balance": "0"
}
```

Currently it requires user's unique identifier (`id`) only.
The response will contain current state of user record.

Note that account identifiers are handled as strings, not integers:
- any string is acceptable as account identifier.
  For example, you can use UUIDs as account identifiers.
  But don't use identifiers that may change over time, such as nicknames, emails, phone numbers, etc.
- different string representations of same number are different identifiers.
  E.g. users `1` and `01` are two different users.

The record can be requested later using `achivx.accounts.Accounts/GetAccountDetails` procedure:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" -plaintext -d '{"id": "1"}' localhost:50051 achivx.accounts.Accounts/GetAccountDetails
{
  "id": "1",
  "balance": "0"
}
```

You may want to call this procedure when rendering users private account pages to show them how much tokens do they have.

See [accounts protocol definition](../protocols/accounts.proto) for more details.

## Sending rewards to account

In order to send a reward to account use `achivx.transactions.Transactions/PayToAccount` procedure:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"account": "1", "amount":"2"}' localhost:50051 achivx.transactions.Transactions/PayToAccount
{
  "id": "66545713cee8a151fb7f7eae",
  "amount": "2",
  "timestamp": "2024-05-27T09:49:07.132Z",
  "withdrawal": {}
}
```

This procedure may be used to create a transaction that will not be paid immediately:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"account": "1", "amount":"1", "status": "HOLD"}' localhost:50051 achivx.transactions.Transactions/PayToAccount
{
  "id": "66545785cee8a151fb7f7eb3",
  "amount": "1",
  "status": "HOLD",
  "timestamp": "2024-05-27T09:51:01.233Z",
  "withdrawal": {}
}
```

this call will create a transaction in status `HOLD`, which can later be approved or denied by calling `achivx.transactions.Transactions/ApproveTransaction`:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"id": "66545785cee8a151fb7f7eb3"}' localhost:50051 achivx.transactions.Transactions/ApproveTransaction
{
  "id": "66545785cee8a151fb7f7eb3",
  "account": "1",
  "amount": "1",
  "timestamp": "2024-05-27T09:51:01.233Z",
  "withdrawal": {}
}
```

... or denied by calling `achivx.transactions.Transactions/DenyTransaction`:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"id": "66545785cee8a151fb7f7eb3"}' localhost:50051 achivx.transactions.Transactions/DenyTransaction
{
  "id": "66545785cee8a151fb7f7eb3",
  "account": "1",
  "amount": "1",
  "status": "DENIED",
  "timestamp": "2024-05-27T09:51:01.233Z",
  "withdrawal": {}
}
```

This enables you to manually check some automatically created transactions before letting users withdraw tokens granted by these transactions.

## Getting transactions list

List of transactions can be acquired by calling `achivx.transactions.Transactions/GetTransactionsList` procedure:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{}' localhost:50051 achivx.transactions.Transactions/GetTransactionsList
{
  "id": "66545cb8340d2b2bdac31e58",
  "account": "1",
  "amount": "1",
  "timestamp": "2024-05-27T10:13:12.329Z",
  "withdrawal": {}
}
{
  "id": "66545c09d11f9e4025b679b0",
  "account": "1",
  "amount": "1",
  "status": "APPROVED",
  "timestamp": "2024-05-27T10:10:17.112Z",
  "withdrawal": {}
}
```

Request fields allow to filter and paginate the list.
See [protocol definition](../protocols/transactions.proto) for more details.

## Withdrawing tokens

### Getting blockchain settings

ACHIVX Reward System features support of multiple cryptocurrencies.
New blockchain and currency types [can be added using extensions](./extending-blockchain-support.md).
New currencies of exiting types can be added [using configuration files](./configuration.md#blockchain-configuration).
In order to help you avoid duplication of networks/currencies lists and blockchain-related procedures, ACHIVX Reward System exposes them using a set of RPCs.
For example, lists of supported networks and currencies can be acquired by calling `achivx.blockchain.Networks/GetNetworks` and `achivx.blockchain.Currencies/GetCurrencies`:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{}' localhost:50051 achivx.blockchain.Networks/GetNetworks    
{
  "name": "Tron-Main",
  "typeName": "Tron"
}
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{}' localhost:50051 achivx.blockchain.Currencies/GetCurrencies
{
  "name": "ACHIVX_Tron",
  "typeName": "TRC20",
  "network": "Tron-Main"
}
```

See [protocol definition](../protocols/blockchain.proto) for more details.

### Requesting withdrawal

An account must have associated withdrawal wallet in order to be able to withdraw tokens.
The wallet can be added by calling `achivx.accounts.Accounts/AddWithdrawalAddress`:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"account": "1", "network": "Tron-Main", "address": "<wallet-address>"}' localhost:50051 achivx.accounts.Accounts/AddWithdrawalAddress
{
  "id": "1",
  "balance": "5",
  "withdrawalAddresses": [
    {
      "network": "Tron-Main",
      "address": "<wallet-address>"
    }
  ]
}
```

This procedure is supposed to be called after users enter a new address in their profile settings on your site/application.

The call returns resulting state of the account.
Note that an account may have multiple withdrawal wallets, but at most one address per blockchain network.

When users have a withdrawal wallet they can request withdrawal of tokens.
This is done by calling `achivx.transactions.Transactions/RequestWithdrawal`:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"account": "1", "currency": "ACHIVX_Tron", "rate": "1", "amount": "0.000001"}' localhost:50051 achivx.transactions.Transactions/RequestWithdrawal 
{
  "id": "66547014340d2b2bdac31e69",
  "account": "1",
  "amount": "-0.000001",
  "status": "HOLD",
  "timestamp": "2024-05-27T11:35:48.012Z",
  "withdrawal": {
    "isWithdrawal": true,
    "currencyId": "ACHIVX_Tron",
    "withdrawalAddress": "<wallet-address>",
    "amount": "0.000001"
  }
}
```

For this call you should provide an amount of internal tokens to withdraw (optional, defaults to the whole account's balance) as well as conversion rate between internal tokens and actual blockchain tokens.

The call returns a created transaction.
Note that the transaction is always in `HOLD` status, which means that it will not be processed immediately.
Instead you should either approve or deny the transaction using procedures described [previously](#sending-rewards-to-account).

### Running withdrawal jobs

Withdrawal is not performed immediately when a transction is approved.
Instead there is a batch jobs that collect all approved transactions for each currency and send them to blockchain.
These jobs are typically named like `withdraw@<currency name>`.
They can be launched either by executing scripts in ACHIVX Reward System server context or by calling an RPC.

See [jobs documentation](./jobs.md) for more details.

After successful job completion, status of the transaction changes and hash of blockchain transaction appears in transaction record:

```
grpcurl --rpc-header "authentication:${AUTH_TOKEN}" --plaintext -d '{"id": "66547014340d2b2bdac31e69"}' localhost:50051 achivx.transactions.Transactions/GetTransactionDetails
{
  "id": "66547014340d2b2bdac31e69",
  "account": "1",
  "amount": "-0.000001",
  "status": "MINED",
  "timestamp": "2024-05-27T11:35:48.012Z",
  "withdrawal": {
    "isWithdrawal": true,
    "currencyId": "ACHIVX_Tron",
    "withdrawalAddress": "<wallet-address>",
    "amount": "0.000001",
    "transactionId": "<transaction-hash>",
    "transactionUrl": "https://tronscan.org/#/transaction/<transaction-hash>"
  }
}
```

### Dealing with transaction failures

Transactions are not always sent to blockchain successfully.

In some cases the job is able to ensure that the transaction was not sent.
Transaction status changes to `SEND_FAILED` in such case.
Another attempt to send such transactions will be taken on next run of the withdrawal job.

In other cases the job may try to send the transaction but will not be able to confirm if it succeed or failed.
Transaction status changes to `SENDING` in such case.
The job will try to check if the transaction has succeed or failed on next run and change transaction status if result could be determined.
If it cannot be determined after some timeout (1 day by default for TRC20 currencies), another attempt to send the transaction will be performed.

In the worst case an error happens while sending the transaction and the job cannot determine it's reason and if it's safe to send the transaction again.
Transaction status changes to `SEND_UNKNOWN_ERROR` in such case.
Transactions in this status will not be handled automatically and require manual actions.
After checking the status of transaction manually you should call `achivx.transactions.Transactions/RestoreWithdrawalStatus` procedure to chage it status to either `SEND_FAILED`, `DENIED` or `MINED`.

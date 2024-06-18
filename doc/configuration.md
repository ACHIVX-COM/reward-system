# Configuration

This document describes all aspects of ACHIVX Reward System configuration.

## Environment variables

Some settings should be provided as environment variables:

| Variable                   | Default                                  | Description                                                                                            |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `BIND_ADDRESS`             | `0.0.0.0:50051`                          | Address to run GRPC server on                                                                          |
| `MONGODB_URL`              | None                                     | URL of mongodb database to use, including credentials. E.g. `mongodb://user:password@localhost/achivx` |
| `AUTH_TOKEN`               | None                                     | A token that client must specify in `authentication` metadata in order to get access to the service    |
| `NETWORKS_CONFIG_PATH`     | `<projectRoot>/config/networks.json`     | Path to JSON file describing blockchain networks the service should use                                |
| `CURRENCIES_CONFIG_PATH`   | `<projectRoot>/config/currencies.json`   | Path to JSON file describing blockchain currencies the service should use                              |
| `TRON_PRIVATE_KEY`         | None                                     | Private key for Tron network(s) master wallet                                                          |
| `GAMIFICATION_CONFIG_PATH` | `<projectRoot>/config/gamification.json` | Path to JSON file with gamification configuration                                                      |

Environment variables that have no default values are usually required for the service to start.

## Blockchain configuration

ACHIVX Reward System allows for withdrawal of user's rewards to cryptocurrencies.
Supported blockchains and currencies are configured using JSON files.
[Default configuration](../config/) is set to use Tron mainnet and ACHIVX TRC20 token.
At this moment, only TRC20 tokens in Tron network are supported.

### Networks configuration

Networks configuration JSON file consists of key-value pairs, where the key is a name of a network and the value is an object containing network settings:

```JavaScript
{
  "My-Network": {
    // Network type. The only required parameter.
    "type": "Tron",

    // ... more parameters
  }
}
```

The only required parameter is network type name.
It must be set to one of supported network types (currently it's only "Tron").
Support for more networks can be added by [implementing a blockchain extension module](./extending-blockchain-support.md).

#### Tron network configuration

For Tron networks the configuration may contain the following parameters:

| name                    | default                | description                                                                                                                              |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `privateKeyEnv`         | `TRON_PRIVATE_KEY`     | Name of environment variable containing private key of master-wallet for this network                                                    |
| `tronWebConfig`         | none                   | Parameters for TronWeb library initialization. See [TronWeb docs](https://tronweb.network/docu/docs/quickstart) for full parameters list |
| `tronScanHostname`      | `https://tronscan.org` | Hostname of tronscan (or alike) service. Will be used to format transaction URLs.                                                        |
| `minSunStakedForEnergy` | `1000000000`           | Amount of SUN to stake for `freeze-trx` [job](./jobs.md).                                                                                |

When private key is specified both in `tronWebConfig.privateKey` and an environment variable, the later one will be used.

### Currencies configuration

Currencies configuration JSON file consists of key-value pairs, where the key is a name of a currency and the value is an object containing currency settings:

```JavaScript
{
  "My-Currency": {
    // Currency type
    "type": "TRC20",

    // The network this currency uses
    "network": "My-Network",

    // .. more parameters
  }
}
```

Just like with networks there is a required `type` parameter which must be one of supported currency types (currently it's only "TRC20").
Support for additional currency types can also be added by [implementing a blockchain extension module](./extending-blockchain-support.md).

Another required parameter is a network name.
It must be a name of network previously configured in networks configuration file.

#### TRC20 currency (token) configuration

| name                            | default | description                                                                                                                                     |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `decimals`                      | 6       | Decimals number of the token. It should match the value returned by the contract. Otherwise the amount of transferred tokens will be incorrect. |
| `address`                       | None    | Address of the TRC20 contract.                                                                                                                  |
| `extImplAddress`                | None    | Optional, see below. Address of extension implementation contract.                                                                              |
| `feeLimit`                      | None    | Fee limit for transactions.                                                                                                                     |
| `stuckTransactionResendTimeout` | `1 day` | A time to wait before re-sending a transaction to blockchain when its status cannot be fetched.                                                 |

ACHIVX TRC20 contract has some additional methods beyond standard TRC20 interface.
One of such methods enables batch transfer of tokens - thus making withdrawal transaction more efficient when there are many of them.
The additional methods are exposed through a separate contract, address of such contract can be specified with `extImplAddress`.
If contract does not implement such methods, `extImplAddress` should be omitted.
The service will use standard TRC20 transactions if `extImplAddress` is not set.

## Gamification configuration

TBD

### Levels

TBD

### Actions

Actions are configured in `"actions"` section of gamification config file.
The section is a JSON object where a key is an action name and the value is an object containing action settings:

```JavaScript
{
  // ...,
  "actions": {
    // Name of the action is a key in "actions" section.
    "MyAction": {
      // Amount of experience the user receives for this action.
      // Defaults to 0
      "xp": 20,

      // Reward in internal tokens the user receives.
      // Defaults to 0
      "reward": 1,

      // Can the action be performed multiple times by single user?
      // Defaults to false.
      // If true, you should provide a unique (among the same actions of the same user) key for each action instance.
      "repeatable": true,

      // True if this action should be treated as user activity.
      // Defaults to true.
      // It should be set to false for actions the user does not perform but should be rewarded from e.g. "get a reaction on post".
      "trackActivity": true
    }
  }
}
```

### XP Reduction

ACHIVX Reward System provides a [job](./jobs.md) to reduce experience of inactive users.
The job name is `"reduce-xp"`.
The job is configured by `"experienceReduction"` section of gamification configuration file:

```JavaScript
{
  // ...
  "experienceReduction": {
    // Enables XP reduction.
    // It is disabled by default.
    "enabled": true,

    // Amount of XP taken from user on every reduction.
    "amount": 100,

    // Duration of user inactivity before first reduction.
    "delay": "30 days",

    // Interval between following reductions, if user is still inactive.
    "interval": "30 days",
  }
}
```

### Medals

TBD

##### Action-based medals

A medal that user receives for specified number of certain actions within a time frame, e.g. for writing 10 posts in one month.

The medal can be recalled automatically if user does not perform another number of same actions within some time frame.
E.g. if user does not write any posts for another month.

```JavaScript
{
  // ...
  "medals": {
    // ...
    "MyMedal": {
      "type": "ActionBased",

      // Weights of actions taken into account for this medal.
      //
      // When checking if a user is eligible for certain rank of this medal, the system will search for all actions of these types.
      // Then it will compute a user score as sum of number of actions of each type multiplied by weight of the type.
      // Ant then it will give the user a medal if the score is higher than a threshold specified for the rank.
      "actions": {
        "WritePost": 1,

        // The weight may be negative, so, for example, each banned post will cancel out two written posts.
        "GetPostBanned": -2
      },
      "ranks": [
        {
          // Higher value for a more difficult rank to achieve.
          // This number is returned when fetching user medals using RPC.
          // It's up to you, how it will be displayed to user - for example, you can display rank 10 as "silver medal" and rank 100 as "golden medal".
          "rank": 10,

          // Duration for which the actions should be performed
          "period": "31 days",

          // Score necessary to get this rank of this medal
          "threshold": 15
        },
        {
          "rank": 100,
          "period": "93 days",
          "threshold": 45
        }
      ],
      "recall": {
        // Enables automatic recall of a medal.
        // When enabled, users with this medal will lose it if their score gets below specified threshold.
        "enabled": true,

        // Time period for which the score is calculated when checking for medal recall.
        "period": "31 days",

        // Score threshold.
        // If score for the period gets below this value, the user will lose the medal.
        "threshold": 7
      }
    }
  }
}
```

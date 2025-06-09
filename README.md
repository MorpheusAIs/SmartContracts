# Morpheus

Smart Contracts For The Morpheus Network

This repository contains following smart contracts for the Morpheus Network.

### Token
* `MOR OFT` - The Morpheus Network Token with integrated LayerZero OFT (Omnichain Fungible Token) standard. 

### Capital Protocol
#### L1
* `DistributionV6` - the basis of the previous version of the protocol (`Distribution V5`). Contains logic with the extension of the possibility of claiming instead of the initial staker.

* `DepositPool` - the basis of the previous version of the protocol (`Distribution V6`). Adds the ability to stake multiple tokens, changes the mechanism for calculating rewards and yield. Each stake token has its own `DepositPool`
* `ChainLinkDataConsumer` - realizes integration with ChainLink, used for receiving the price feeds.
* `L1SenderV2` - takes all protocol yields from `DepositPool`s, converts to wstETH, and forwards to L2.
* `RewardPool` - the MOR reward calculation curve is in this contract. Allows to create reward pools, set curves and calculate the required number of rewards.
* `Distributor` -  brings all the contracts together in one place for L1. Calculates rewards for users, calculates protocol yield.

#### L2
* `L2TokenReceiverV2` - A contract that receives tokens from the L1Sender contract. It is used to Uniswap market making.
* `L2MessageReceiver` - A contract that receives messages from the L1Sender contract.

### Builders Protocol
* `BuilderSubnets` - The main contract for builders, accepts user stakes, calculates rewards and gives them out.
* `FeeConfig` - The contract is responsible for the fees of the protocol.

[**Documentation**](https://github.com/MorpheusAIs/Docs/blob/main/Smart%20Contracts/Overview.md)

## Install Dependencies

To install the dependencies, run the following command:

```bash
npm install
```

## Compilation

To compile the contracts, use the next script:

```bash
npm run compile
```

## Environment Variables

Before any following steps, you need to create an `.env` file following the example of `.env.example`.

## Test

To run the tests, execute the following command:

```bash
npm run test
```

To run the tests for forked mainnet, run:

```bash
npm run test-fork
```

> You need to set the `INFURA_KEY` and `PRIVATE_KEY` environment variables to run the tests for forked mainnet.

Or to see the coverage, run:

```bash
npm run coverage
```

> You need to set the `INFURA_KEY` and `PRIVATE_KEY` environment variables to run the coverage.

## Deployment

You need to fill out config file `deploy/data/config.json` (yoy may choose another file name, based on the network). The example of the config file is already provided. Make sure to fill out all the fields, specifically the `payoutStart` field.

Next, call script located in `deploy/deploy-all.sh` with the following arguments:

```bash
./deploy/deploy-all.sh <L1 network> <L2 network>
```

Where the first argument is the L1 network name and the second argument is the L2 network name.

(network is the name of the network, which should be in `hardhat.config.js`)

### Local Deployment

To deploy the contracts locally, run the following commands (in the different terminals):

```bash
npm run private-network
./deploy/deploy-all.sh localhost localhost
```

> The local deployment is may fail due to the lack of third-party contracts. To fix this, you may run test deployment on the forked mainnet.

## Bindings

The command to generate the bindings is as follows:

```bash
npm run generate-types
```

> See the full list of available commands in the `package.json` file.

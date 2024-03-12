# Morpheus

Smart Contracts For The Morpheus Network

This repository contains the smart contracts for the Morpheus Network.
Contains the following contracts:

* *MOR* - The Morpheus Network Token.
* *LinearDistributionIntervalDecrease* - A library for calculating linear distribution intervals with a plenty of options.
* *Distribution* - The contract that distributes the MOR tokens to the stakers and the team members.
* *L1Sender* - A contract that allows to communicate between L1 and L2. It is used to send a minting request to the L2 using the Layer Zero. It is also used to transfer deposited tokens from the L1 to the L2.
* *L2MessageReceiver* - A contract that receives messages from the L1Sender contract.
* *L2TokenReceiver* - A contract that receives tokens from the L1Sender contract. It is used to Uniswap market making.

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

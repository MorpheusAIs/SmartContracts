import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@nomiclabs/hardhat-web3';
import '@solarity/hardhat-markup';
import '@solarity/hardhat-migrate';
import '@typechain/hardhat';
import * as dotenv from 'dotenv';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from 'hardhat/builtin-tasks/task-names';
import { subtask } from 'hardhat/config';
import { HardhatUserConfig } from 'hardhat/config';
import 'solidity-coverage';
import 'solidity-docgen';
import 'tsconfig-paths/register';

dotenv.config();

// Skips builder-protocol and legacy "old" contracts -- not part of the current capital-protocol
// Base-L2 work. NOTE: keeps `contracts/interfaces/**/old/**` -- the *interfaces*, not the old
// implementations -- because current-version mocks (`L1SenderMock`, `DistributorMock`,
// `DepositPoolMock`, still used by e.g. `L1SenderV3.test.ts`) import types from there.
const EXCLUDED_COMPILE_PATTERNS = [
  /\/contracts\/builder-protocol\//,
  /\/contracts\/interfaces\/builder-protocol\//,
  /\/contracts\/extensions\//,
  /\/contracts\/interfaces\/extensions\//,
  /\/contracts\/capital-protocol\/old\//,
  /\/contracts\/old\//,
  /\/contracts\/interfaces\/old\//,
];

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths: string[] = await runSuper();

  return paths.filter((p) => !EXCLUDED_COMPILE_PATTERNS.some((re) => re.test(p)));
});

function privateKey() {
  return process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];
}

function typechainTarget() {
  const target = process.env.TYPECHAIN_TARGET;

  return target === '' || target === undefined ? 'ethers-v6' : target;
}

function forceTypechain() {
  return process.env.TYPECHAIN_FORCE === 'false';
}

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      initialDate: '1970-01-01T00:00:00Z',
      // forking: {
      //   url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      //   // url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      //   // url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      // },
    },
    ethereum: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
  },
  solidity: { version: '0.8.20', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
  etherscan: {
    apiKey: {
      ethereum: `${process.env.ETHERSCAN_KEY}`,
      arbitrum: `${process.env.ETHERSCAN_KEY}`,
      base: `${process.env.ETHERSCAN_KEY}`,
    },
    customChains: [
      {
        network: 'ethereum',
        chainId: 1,
        urls: {
          apiURL: `https://api.etherscan.io/v2/api?chainid=1&apikey=${process.env.ETHERSCAN_KEY}`,
          browserURL: 'https://etherscan.io',
        },
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: `https://api.etherscan.io/v2/api?chainid=8453&apikey=${process.env.ETHERSCAN_KEY}`,
          browserURL: 'https://basescan.org',
        },
      },
      {
        network: 'arbitrum',
        chainId: 42161,
        urls: {
          apiURL: `https://api.etherscan.io/v2/api?chainid=42161&apikey=${process.env.ETHERSCAN_KEY}`,
          browserURL: 'https://arbiscan.io',
        },
      },
    ],
  },
  migrate: {
    pathToMigrations: './deploy/',
  },
  mocha: { timeout: 1000000 },
  contractSizer: { alphaSort: false, disambiguatePaths: false, runOnCompile: false, strict: false },
  gasReporter: { currency: 'USD', gasPrice: 50, enabled: false, coinmarketcap: `${process.env.COINMARKETCAP_KEY}` },
  typechain: {
    outDir: `generated-types/${typechainTarget().split('-')[0]}`,
    target: typechainTarget(),
    alwaysGenerateOverloads: true,
    discriminateTypes: true,
    dontOverrideCompile: forceTypechain(),
  },
  docgen: {
    pages: 'files',
    exclude: [
      '@layerzerolabs',
      'interfaces',
      'extensions',
      'libs',
      'mock',
      'old',
      'builder-protocol/old',
      'capital-protocol/old',
    ],
  },
  sourcify: {
    enabled: false,
  },
};

export default config;

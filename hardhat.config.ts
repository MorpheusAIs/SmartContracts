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
import { HardhatUserConfig } from 'hardhat/config';
import 'solidity-coverage';
import 'solidity-docgen';
import 'tsconfig-paths/register';

dotenv.config();

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
      gas: 'auto',
      // forking: {
      //   url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      // },
      // forking: {
      //   url: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      // },
      // forking: {
      //   url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      // },
      // forking: {
      //   url: `https://arbitrum-sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
      // },
      // forking: {
      //   url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      // },
      // forking: {
      //   url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      //   // blockNumber: 8310175,
      // },
      // forking: {
      //   url: `https://polygon-mumbai.blockpi.network/v1/rpc/public`,
      // },
      // forking: {
      //   url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      // },
      // forking: {
      //   url: `https://sepolia.base.org`,
      // },
      // forking: {
      //   url: `https://base-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      //   // blockNumber: 25936700,
      // },
      // forking: {
      //   url: `https://base.llamarpc.com`,
      //   blockNumber: 25164000,
      // },
      // accounts: [
      //   {
      //     privateKey: `${process.env.PRIVATE_KEY}`,
      //     balance: '1000000000000000000000',
      //   },
      // ],
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      initialDate: '1970-01-01T00:00:00Z',
      gasMultiplier: 1.2,
      timeout: 1000000000000000,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
    chapel: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      accounts: privateKey(),
      gasMultiplier: 1.2,
      timeout: 60000,
    },
    mumbai: { url: `https://polygon-mumbai.blockpi.network/v1/rpc/public`, accounts: privateKey(), gasMultiplier: 1.1 },
    polygonAmoy: {
      url: `https://polygon-amoy.blockpi.network/v1/rpc/public`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
    fuji: {
      url: `https://avalanche-fuji.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    bsc: { url: 'https://bsc-dataseed.binance.org/', accounts: privateKey(), gasMultiplier: 1.2 },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    polygon: { url: `https://matic-mainnet.chainstacklabs.com`, accounts: privateKey(), gasMultiplier: 1.2 },
    avalanche: {
      url: `https://api.avax.network/ext/bc/C/rpc`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
      timeout: 60000,
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    arbitrum_goerli: {
      url: `https://arbitrum-goerli.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.2,
    },
    arbitrum_sepolia: {
      url: `https://arbitrum-sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
    base_sepolia: { url: `https://sepolia.base.org`, accounts: privateKey(), gasMultiplier: 1.1 },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: privateKey(),
      gasMultiplier: 1.1,
    },
  },
  solidity: { version: '0.8.20', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
  etherscan: {
    apiKey: {
      goerli: `${process.env.ETHERSCAN_KEY}`,
      sepolia: `${process.env.ETHERSCAN_KEY}`,
      mainnet: `${process.env.ETHERSCAN_KEY}`,
      bscTestnet: `${process.env.BSCSCAN_KEY}`,
      bsc: `${process.env.BSCSCAN_KEY}`,
      polygonMumbai: `${process.env.POLYGONSCAN_KEY}`,
      polygonAmoy: `${process.env.POLYGONSCAN_KEY}`,
      polygon: `${process.env.POLYGONSCAN_KEY}`,
      avalancheFujiTestnet: `${process.env.AVALANCHE_KEY}`,
      avalanche: `${process.env.AVALANCHE_KEY}`,
      arbitrumOne: `${process.env.ARBITRUM_KEY}`,
      arbitrumGoerli: `${process.env.ETHERSCAN_KEY}`,
      arbitrum_sepolia: `${process.env.ARBITRUM_KEY}`,
      base_sepolia: `${process.env.BASE_KEY}`,
      base: `${process.env.BASE_KEY}`,
    },
    customChains: [
      {
        network: 'arbitrum_sepolia',
        chainId: 421614,
        urls: { apiURL: 'https://api-sepolia.arbiscan.io/api', browserURL: 'https://sepolia.arbiscan.io/' },
      },
      {
        network: 'base_sepolia',
        chainId: 84532,
        urls: { apiURL: 'https://api-sepolia.basescan.org/api', browserURL: 'https://sepolia.base.io/' },
      },
      {
        network: 'polygonAmoy',
        chainId: 80002,
        urls: { apiURL: 'https://api-amoy.polygonscan.com/api', browserURL: 'https://amoy.polygonscan.com' },
      },
    ],
  },
  migrate: {
    pathToMigrations: './deploy/',
    // only: 1,
  },
  mocha: { timeout: 1000000 },
  contractSizer: { alphaSort: false, disambiguatePaths: false, runOnCompile: true, strict: false },
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
};

export default config;

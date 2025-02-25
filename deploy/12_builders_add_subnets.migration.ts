import { Deployer } from '@solarity/hardhat-migrate';

import { Builders__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const pools = [
  {
    name: 'Unocoin',
    admin: '0x2e056a68c7eF30d0a5487703696184E6dCAe4668',
  },
  // {
  //   name: 'Morphues Node',
  //   admin: '0xF9B58539edFA57B4013E658666B1c61D165bcf3a',
  // },
  // {
  //   name: 'Frostbyte',
  //   admin: '0x4375a9cda86FF20ab963fdEbd89610D4311d5b28',
  // },
];

const defaultPoolParams = {
  poolStart: 1739979000,
  withdrawLockPeriodAfterDeposit: 2592000, // 30 days
  claimLockEnd: 1740065400, // Monday, 17 February 2025 р., 00:00:00
  minimalDeposit: wei(0.001),
};

module.exports = async function (deployer: Deployer) {
  // Base
  const builders = await deployer.deployed(Builders__factory, '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9');

  // Arbitrum
  // const builders = await deployer.deployed(Builders__factory, '0xC0eD68f163d44B6e9985F0041fDf6f67c6BCFF3f');

  for (let i = 0; i < pools.length; i++) {
    await builders.createBuilderPool({ ...pools[i], ...defaultPoolParams });
  }
};

// npx hardhat migrate --only 12
// npx hardhat migrate --network localhost --only 12
// npx hardhat migrate --network base --only 12
// npx hardhat migrate --network arbitrum --only 12

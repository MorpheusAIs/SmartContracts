import { Deployer } from '@solarity/hardhat-migrate';

import { Builders__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const pools = [
  // {
  //   name: 'Unocoin',
  //   admin: '0x2e056a68c7eF30d0a5487703696184E6dCAe4668',
  // },
  // {
  //   name: 'Morphues Node',
  //   admin: '0xF9B58539edFA57B4013E658666B1c61D165bcf3a',
  // },
  // {
  //   name: 'Frostbyte',
  //   admin: '0x4375a9cda86FF20ab963fdEbd89610D4311d5b28',
  // },
  // {
  //   name: '4kGpL8',
  //   admin: '0x05a1ff0a32bc24265bcb39499d0c5d9a6cb2011c',
  // },
  {
    name: 'aB3dH7',
    admin: '0xae855e324087a34e96bb9127d2e17c1a12873020',
  },
  {
    name: '9nRt5e',
    admin: '0xc6a4ce513dd749fb25c35e044f00646abd8f8969',
  },
  {
    name: 'LpM2cA',
    admin: '0xa17b82286601825a5ac45dcb01f38242d1a79548',
  },
  {
    name: 'pR6tG2',
    admin: '0x46c842f3875b0378bd87529b3217f5de55b20844',
  },
  {
    name: 'nH7lM5',
    admin: '0xd8737632121d4c50b76fa3349b3c197c4574170a',
  },
  {
    name: 'fT6aM1',
    admin: '0xfe55121bd7dcfc20258affa7bad42bba1585d808',
  },
  {
    name: '8lP2kH',
    admin: '0xbd7ad02ec306781055d498753bc415c55da04e33',
  },
  {
    name: 'rE5dN7',
    admin: '0xdca583bc7a8cfc87fc3d0a68f4d6d00582ecce28',
  },
  {
    name: 'pL1cM6',
    admin: '0x95a963e1deb75d0db2172ac772302efba0125b48',
  },
  {
    name: '2hG4yB',
    admin: '0xeb364e3bd1684f598ecb5d450eaa004f4c71ea50',
  },
  {
    name: 'eK7nR8',
    admin: '0xb18eb611f4c7d51420462c926ae2cc0b5d362e7a',
  },
  {
    name: 'cD3fT9',
    admin: '0x1f16a0fc4a130c3436fe210cfb46e12f59f411dc',
  },
  {
    name: '1mB2pH',
    admin: '0x98eff980c57c9d333340b3856481bf7b8698987c',
  },
  {
    name: 'Web3 Cities Network',
    admin: '0x9bb5fc1c56eaabc4bfa0a37398d397a956354afb',
  },
  {
    name: 'FreeOpsDAO',
    admin: '0x7bfca252bff95f218eca93f5d042b85d7195fa6a',
  },
  {
    name: '7yB1gF',
    admin: '0x1723a88158118ad1ae03a873b2df1e8de4fb921e',
  },
  {
    name: 'Decentranet',
    admin: '0xe29f5a28b46a390e917930b3b0be6dab20eceeb4',
  },
  {
    name: 'eA8cT3',
    admin: '0x42a832e64270948700b92c8ecc1c977eee82af41',
  },
  {
    name: '6sN8e4',
    admin: '0x30f0AdeAD0BEd51764cB5A87c6A692b592287727',
  },
  {
    name: 'gF2yM5',
    admin: '0x81e94bb131b184dcb2cedc4ac95622058176290a',
  },
  {
    name: '6eB1cH',
    admin: '0xb3c1c4c5c1223be2d3e99c75fabd1d4206e05f67',
  },
  {
    name: '5kP7lT',
    admin: '0xc6845baa81b62166eda50e2fe47dcc096679eb95',
  },
  {
    name: 'pR9fL8',
    admin: '0x270c7f012566b850afd00b2b7b4be743cf7cdb95',
  },
  {
    name: 'Shiza',
    admin: '0x7b8997eFC20BDc8b2162F648d79c465f78a2e5fa',
  },
];

const defaultPoolParams = {
  poolStart: 1741972500,
  // withdrawLockPeriodAfterDeposit: 2592000, // 30 days
  withdrawLockPeriodAfterDeposit: 604800, // 7 days
  claimLockEnd: 1741972800,
  minimalDeposit: wei(1),
};

module.exports = async function (deployer: Deployer) {
  // Base
  // const builders = await deployer.deployed(Builders__factory, '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9');

  // Arbitrum
  const builders = await deployer.deployed(Builders__factory, '0xC0eD68f163d44B6e9985F0041fDf6f67c6BCFF3f');

  for (let i = 0; i < pools.length; i++) {
    await builders.createBuilderPool({ ...pools[i], ...defaultPoolParams });
    console.log(`${pools[i].name} - ${i}`);
  }
};

// npx hardhat migrate --only 12
// npx hardhat migrate --network localhost --only 12
// npx hardhat migrate --network base --only 12
// npx hardhat migrate --network arbitrum --only 12

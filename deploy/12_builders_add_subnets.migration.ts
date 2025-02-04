import { Deployer } from '@solarity/hardhat-migrate';

import { Builders__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const pools = [
  // {
  //   name: 'Venice',
  //   admin: '0x3666f9a79647c81b3b0aAb98B9834F5020E762e0',
  // },
  // {
  //   name: 'Nounspace',
  //   admin: '0xef93cCF233A6c6a0f3ce78E30Ca3A06c06942133',
  // },
  // {
  //   name: '6079',
  //   admin: '0xc686d10C51B59DcB123547F2a3762e3ad43dD777',
  // },
  // {
  //   name: 'Theoriq',
  //   admin: '0x0199346A0c257aC901a899Baa83bCF1bCFA9E0e5',
  // },
  // {
  //   name: 'Lumerin',
  //   admin: '0xD87091bCf26332C501A08F90f9AaD99A7c9045C3',
  // },
  // {
  //   name: 'exaBITS',
  //   admin: '0x59eb7b69D07540549F1913F26855F8247557a8ab',
  // },
  // {
  //   name: 'ZO.ME',
  //   admin: '0xbbDeA6172Be7798F7FA37E7E5432D9426954c1DE',
  // },
  // {
  //   name: 'Flock.io',
  //   admin: '0x372663a3629CBfD377c94d5962Bd0b62C824Bd4a',
  // },
  // {
  //   name: 'Renascence',
  //   admin: '0xB4a0462e8F0511F01689FF8D58d649b46E90Cb9C',
  // },
  // {
  //   name: 'Rainfall',
  //   admin: '0xBd4672F2f283a081926B8B150B31022D2eEcac8f',
  // },
  // {
  //   name: 'Arkeo',
  //   admin: '0xA466F111133f218a024DE7d85b6B1d8Da0224bfd',
  // },
  // {
  //   name: 'Hyperbolic',
  //   admin: '0xe885927bA18E12A426A8f774149CAF6613901003',
  // },
  // {
  //   name: 'Morlord',
  //   admin: '0xb56BED300F084e308C7EAB17c175fDc40Ef3885f',
  // },
  // {
  //   name: 'ATX DAO',
  //   admin: '0xCbb0aAC025f0554978A5eC4B35169E71E4910213',
  // },
  // {
  //   name: 'CETI',
  //   admin: '0x1F22b27F0B4FAF651DBaea215b32988F658008a3',
  // },
  // {
  //   name: 'Gen Layer',
  //   admin: '0x12584bBE07643064992D603664937FA801112EF4',
  // },
  // {
  //   name: 'OLAS',
  //   admin: '0xB04b996738F69DdAd9099ACb040E500c2492446d',
  // },
  // {
  //   name: 'Wire Network',
  //   admin: '0x3cAAc83717157D7e9b14545803f36Ff1650b467f',
  // },
  // {
  //   name: 'Phala Network',
  //   admin: '0x696387BB15DF29600Cf4F646bD4A3658e6BBda7B',
  // },
  // {
  //   name: 'Sapien AI',
  //   admin: '0xb5D104cE51a488EB34C087EC0A245031814C1a52',
  // },
  // {
  //   name: 'Freedom GPT',
  //   admin: '0x3e8D52D57798FC9c37D9618887935a1a5266a715',
  // },
  // {
  //   name: 'DAIS',
  //   admin: '0x28BFe7A0FC7d541aA8Ee1240f1551d65DCa19291',
  // },
  // {
  //   name: 'Shapeshift',
  //   admin: '0x6515514486788392055C794c1692F833F3c40A91',
  // },
  // {
  //   name: 'Manifest Network',
  //   admin: '0xE7432b5415E8b3Dba4a6Ae167e89648A1051CB7F',
  // },
  // {
  //   name: 'Akash',
  //   admin: '0x6c1ed23c071243879CbCC70dFdA211c1f2dDB214',
  // },
  // {
  //   name: 'Near',
  //   admin: '0x82eAAaADfec2E4fC2003Ac9D4fe312De1c468821',
  // },
  // {
  //   name: 'Lifted',
  //   admin: '0xb081870678d563a4d1cf0ab189ab2038695827a3',
  // },
  // {
  //   name: 'Bloq',
  //   admin: '0xf8D5ca35466a7eAba3Fb7F9985d8ECC830Af0667',
  // },
  // {
  //   name: 'Hemi',
  //   admin: '0x21E58574B307766E5cFF933CFfdf4680F40b76b0',
  // },
  // {
  //   name: 'AO Arweave',
  //   admin: '0x38ECFFB55D36afCDa4b8D6b65ffF2eD5f373A4C7',
  // },
  // {
  //   name: 'Virtuals',
  //   admin: '0x64aF3260Da78548ad2F9Be06AE77904690684460',
  // },
  // {
  //   name: 'AI16Z',
  //   admin: '0xD928cA72EaC64523dEF6e2703F9091D9D99019e7',
  // },
  // {
  //   name: 'Gif Studios',
  //   admin: '0x9f853AC79013B932Dc2E45140270ab7A47e65fBF',
  // },
  // {
  //   name: 'IamAI-Core',
  //   admin: '0x26827CcE25992d47180aAD75f3E69cb57D71602B',
  // },
  // {
  //   name: 'Lumerin MOR Staking',
  //   admin: '0x26b36Ad198E89a7258E34115761fAbD64AC63f5e',
  // },
  // {
  //   name: 'Morlord MOR Staking',
  //   admin: '0x72f457d6237f66f68B6EA4408a3219ab7ae13Be8',
  // },
  // {
  //   name: 'Venice Pro',
  //   admin: '0xe01C58819893865b5df20C9f75833401f1c0906B',
  // },
  // {
  //   name: 'MOR Builders',
  //   admin: '0x1Cb2bc7Ef28b2e127a2026FCdD2bf2fc27750525',
  // },
  // {
  //   name: 'Aigent Z',
  //   admin: '0x17E1B6c2BfBC721c1dc03d488746E0C6F7ef5242',
  // },
  {
    name: 'PALcapital',
    admin: '0x920d2b328F2058516496F932F6247d9347C594D2',
  },
];

const defaultPoolParams = {
  // poolStart: 1737124200, // Friday, 17 January 2025 р., 14:30:00
  // poolStart: 1737712800, // Friday, 24 January 2025 р., 10:00:00
  // poolStart: 1737748800, // Friday, 24 January 2025 р., 20:00:00
  // poolStart: 1737990000, // Monday, 27 January 2025 р., 15:00:00
  // poolStart: 1738062000, // Tuesday, 28 January 2025 р., 11:00:00
  // poolStart: 1738185300, // Wednesday, 29 January 2025 р., 21:15:00
  poolStart: 1738260900, // Thursday, 30 January 2025 р., 18:15:00
  withdrawLockPeriodAfterDeposit: 2592000, // 30 days
  claimLockEnd: 1739577600, // Saturday, 15 February 2025 р., 00:00:00
  minimalDeposit: wei(0.001),
};

module.exports = async function (deployer: Deployer) {
  const builders = await deployer.deployed(Builders__factory, '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9');

  for (let i = 0; i < pools.length; i++) {
    await builders.createBuilderPool({ ...pools[i], ...defaultPoolParams });
  }
};

// npx hardhat migrate --only 12
// npx hardhat migrate --network base --only 12

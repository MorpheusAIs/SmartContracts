import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  BuilderSubnets,
  BuilderSubnets__factory,
  Builders,
  BuildersV2,
  BuildersV2__factory,
  Builders__factory,
  ERC1967Proxy__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

// BASE setup
const buildersAddress = '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9';
const feeConfig = '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE';
const stakeToken = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';
const treasury = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4'; // TODO: recheck
const minWithdrawLockPeriodAfterStake = 604800; // TODO: recheck
const maxShareForNetwork = wei(1, 25); // TODO: recheck
const builderPoolData = {
  initialAmount: wei(3456),
  decreaseAmount: wei(0.59255872824),
  payoutStart: 1707393600,
  interval: 86400,
};
const rewardCalculationStartsAt = 1739577600; // Saturday, 15 February 2025 р., 00:00:00,

const subnetLayout = {
  name: '',
  owner: '',
  minStake: '',
  fee: wei(1, 25),
  feeTreasury: '',
  startsAt: 1736899200, // Wednesday, 15 January 2025 р., 00:00:00
  withdrawLockPeriodAfterStake: '',
  minClaimLockEnd: 1739577600, // Saturday, 15 February 2025 р., 00:00:00,
};
const subnets = [
  {
    name: 'Morpheus Node',
    metadata: {
      slug: 'Slug',
      description: 'Description',
      website: 'Website',
      image: 'Image',
    },
    users: ['0x76405775eb54767f1f95a9fd1ea5492b0204d87a', '0xebe2a63d8c69b16e58f75b6f221b8ea16745383e'],
  },
];

module.exports = async function (deployer: Deployer) {
  const builderSubnets = await deployBuildersSubnets(deployer);
  const buildersV2Impl = await deployBuildersV2(deployer);
  const builders = await deployer.deployed(Builders__factory, buildersAddress);

  // MULTISIG EXECUTION ONLY
  const buildersOwner = await getBuildersOwner(builders);
  await builders.connect(buildersOwner).upgradeTo(buildersV2Impl);
  const buildersV2 = await deployer.deployed(BuildersV2__factory, buildersAddress);
  await buildersV2.connect(buildersOwner).setMigrationOwner((await deployer.getSigner()).getAddress());
  // END

  // START prepare buildersV2 for migrations
  await buildersV2.setBuilderSubnets(builderSubnets);
  await buildersV2.setIsPaused(true);
  // END

  for (let i = 0; i < subnets.length; i++) {
    const subnetId = await buildersV2.getPoolId(subnets[i].name);
    const existedSubnet = await buildersV2.builderPools(subnetId);

    const subnet = {
      ...subnetLayout,
      name: subnets[i].name,
      owner: existedSubnet.admin,
      minStake: existedSubnet.minimalDeposit,
      feeTreasury: existedSubnet.admin,
      withdrawLockPeriodAfterStake: existedSubnet.withdrawLockPeriodAfterDeposit,
    };

    await builderSubnets.createSubnet(subnet, subnets[i].metadata);

    for (let k = 0; k < subnets[i].users.length; k++) {
      await buildersV2.migrateUserStake(subnetId, subnets[i].users[k]);
    }
  }
};

const deployBuildersSubnets = async (deployer: Deployer): Promise<BuilderSubnets> => {
  const impl = await deployer.deploy(BuilderSubnets__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuilderSubnets',
  });
  const contract = await deployer.deployed(BuilderSubnets__factory, await proxy.getAddress());
  await contract.BuilderSubnets_init(stakeToken, feeConfig, treasury, minWithdrawLockPeriodAfterStake);
  await contract.setMaxStakedShareFromBuildersPool(maxShareForNetwork);
  await contract.setBuildersPoolData(builderPoolData);
  await contract.setRewardCalculationStartsAt(rewardCalculationStartsAt);

  return contract;
};

const deployBuildersV2 = async (deployer: Deployer): Promise<BuildersV2> => {
  const contract = await deployer.deploy(BuildersV2__factory);

  return contract;
};

const getBuildersOwner = async (builders: Builders) => {
  const buildersOwner = await ethers.getImpersonatedSigner(await builders.owner());
  await ethers.provider.send('hardhat_setBalance', [buildersOwner.address, `0x${ethers.parseEther('1').toString(16)}`]);

  return buildersOwner;
};

// npx hardhat migrate --only 13
// npx hardhat migrate --network base --only 13

// npx hardhat node --fork https://base-mainnet.infura.io/v3/875e92049d46477ba5fd3a0d22f7b7c3
// npx hardhat node --fork https://base-mainnet.g.alchemy.com/v2/Q2JhLCkEJ7ucKemN2ofdr25AP8QU48dG

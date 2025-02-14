import { Deployer } from '@solarity/hardhat-migrate';
import { readFileSync } from 'fs';
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

// Global setup
const builderPoolData = {
  initialAmount: wei(3456),
  decreaseAmount: wei(0.59255872824),
  payoutStart: 1707393600,
  interval: 86400,
};

// BASE setup
const buildersAddress = '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9';
const feeConfig = '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE';
const stakeToken = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';

// Setup from Morpheus
const treasury = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4';
const minWithdrawLockPeriodAfterStake = 604800;
const maxShareForNetwork = wei(1, 25);
const rewardCalculationStartsAt = 1739577600;

module.exports = async function (deployer: Deployer) {
  const builderSubnets = await deployBuildersSubnets(deployer);
  const buildersV2Impl = await deployBuildersV2(deployer);
  const builders = await deployer.deployed(Builders__factory, buildersAddress);

  // MULTISIG EXECUTION ONLY, added for the tests
  const buildersOwner = await getBuildersOwner(builders);
  await builders.connect(buildersOwner).upgradeTo(buildersV2Impl);
  const buildersV2 = await deployer.deployed(BuildersV2__factory, buildersAddress);
  await buildersV2.connect(buildersOwner).setMigrationOwner((await deployer.getSigner()).getAddress());
  // END

  // START prepare buildersV2 for migrations
  await buildersV2.setBuilderSubnets(builderSubnets);
  await buildersV2.setIsPaused(true);
  // END

  await migrate(buildersV2, builderSubnets, 4, 5);
};

const deployBuildersSubnets = async (deployer: Deployer): Promise<BuilderSubnets> => {
  const impl = await deployer.deploy(BuilderSubnets__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuilderSubnets',
  });
  const contract = await deployer.deployed(BuilderSubnets__factory, await proxy.getAddress());
  await contract.BuilderSubnets_init(stakeToken, feeConfig, treasury, minWithdrawLockPeriodAfterStake);
  await contract.setMaxStakedShareForBuildersPool(maxShareForNetwork);
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

const migrate = async (buildersV2: BuildersV2, builderSubnets: BuilderSubnets, from = 0, to = 0) => {
  const configPath = `deploy/data/subgraph-output.json`;

  type Subnet = {
    id: string;
    name: string;
    admin: string;
    startsAt: number;
    minimalDeposit: number;
    withdrawLockPeriodAfterDeposit: number;
    totalUsers: number;
    users: string[];
    description: string;
    website: string;
  };
  const data = JSON.parse(readFileSync(configPath, 'utf-8')) as Subnet[];

  for (let i = from; i < to; i++) {
    const subnet = {
      name: data[i].name,
      owner: data[i].admin,
      minStake: data[i].minimalDeposit,
      fee: wei(1, 25),
      feeTreasury: data[i].admin,
      startsAt: data[i].startsAt,
      withdrawLockPeriodAfterStake: data[i].withdrawLockPeriodAfterDeposit,
      minClaimLockEnd: data[i].startsAt,
    };
    const metadata = {
      slug: data[i].description,
      description: '',
      website: data[i].website,
      image: '',
    };

    await builderSubnets.createSubnet(subnet, metadata);

    const subnetIds = data[i].users.map(() => data[i].id);
    await buildersV2.migrateUsersStake(subnetIds, data[i].users);

    console.log(`Subnet ${data[i].name} migrated`);
  }
};

// npx hardhat migrate --only 13
// npx hardhat migrate --network base --only 13

// npx hardhat node --fork https://base-mainnet.infura.io/v3/875e92049d46477ba5fd3a0d22f7b7c3
// npx hardhat node --fork https://base-mainnet.g.alchemy.com/v2/Q2JhLCkEJ7ucKemN2ofdr25AP8QU48dG

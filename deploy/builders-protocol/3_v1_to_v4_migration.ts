import { Deployer } from '@solarity/hardhat-migrate';
import { readFileSync } from 'fs';
import { ethers } from 'hardhat';

import {
  BuilderSubnets,
  BuilderSubnets__factory,
  Builders,
  BuildersV3,
  BuildersV3__factory,
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

//// BASE setup
const buildersAddress = '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9';
const feeConfig = '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE';
const stakeToken = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';
// Setup from Morpheus
const treasury = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4'; // ???
const minWithdrawLockPeriodAfterStake = 604800; // ???
const maxShareForNetwork = wei(0.7, 25);
const rewardCalculationStartsAt = 1739577600; // ???

//// ARB setup
// const buildersAddress = '0xC0eD68f163d44B6e9985F0041fDf6f67c6BCFF3f';
// const feeConfig = '0xc03d87085E254695754a74D2CF76579e167Eb895';
// const stakeToken = '0x092baadb7def4c3981454dd9c0a0d7ff07bcfc86';
// // Setup from Morpheus
// const treasury = ''; // ???
// const minWithdrawLockPeriodAfterStake = 0; // ???
// const maxShareForNetwork = wei(0.3, 25);
// const rewardCalculationStartsAt = 1739577600; // ???

type Subnet = {
  id: string;
  name: string;
  admin: string;
  startsAt: number;
  minimalDeposit: number;
  claimLockEnd: number;
  withdrawLockPeriodAfterDeposit: number;
  totalUsers: number;
  users: string[];
  description: string;
  website: string;
};

module.exports = async function (deployer: Deployer) {
  const builders = await deployer.deployed(Builders__factory, buildersAddress);
  const buildersV3Impl = await deployBuildersV3(deployer);

  // MULTISIG EXECUTION ONLY, added for the tests
  const buildersOwner = await getBuildersOwner(builders);
  await builders.connect(buildersOwner).upgradeTo(buildersV3Impl);
  const buildersV3 = await deployer.deployed(BuildersV3__factory, buildersAddress);
  await buildersV3.connect(buildersOwner).setMigrationOwner((await deployer.getSigner()).getAddress());
  // END

  const builderSubnets = await deployBuildersSubnets(deployer, buildersV3);

  // START prepare buildersV3 for migrations
  await buildersV3.setPaused();
  await buildersV3.setBuilderSubnets(builderSubnets);
  // END

  await createSubnets(builderSubnets, 0, 20);
  await moveUsersStakes(buildersV3, 0, 20);
};

const deployBuildersSubnets = async (deployer: Deployer, buildersV3: BuildersV3): Promise<BuilderSubnets> => {
  const impl = await deployer.deploy(BuilderSubnets__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuilderSubnets',
  });
  const contract = await deployer.deployed(BuilderSubnets__factory, await proxy.getAddress());
  await contract.BuilderSubnets_init(stakeToken, feeConfig, treasury, minWithdrawLockPeriodAfterStake, buildersV3);
  await contract.setMaxStakedShareForBuildersPool(maxShareForNetwork);
  await contract.setBuildersRewardPoolData(builderPoolData);
  await contract.setRewardCalculationStartsAt(rewardCalculationStartsAt);

  return contract;
};

const deployBuildersV3 = async (deployer: Deployer): Promise<BuildersV3> => {
  const contract = await deployer.deploy(BuildersV3__factory);

  return contract;
};

const getBuildersOwner = async (builders: Builders) => {
  const buildersOwner = await ethers.getImpersonatedSigner(await builders.owner());
  await ethers.provider.send('hardhat_setBalance', [buildersOwner.address, `0x${ethers.parseEther('1').toString(16)}`]);

  return buildersOwner;
};

const createSubnets = async (builderSubnets: BuilderSubnets, from = 0, to = 0) => {
  const configPath = `deploy/builders-protocol/data/subnets.json`;

  const data = JSON.parse(readFileSync(configPath, 'utf-8')) as Subnet[];
  to = to === 0 ? data.length : to;

  for (let i = from; i < to; i++) {
    const subnet = {
      name: data[i].name,
      owner: data[i].admin,
      minStake: data[i].minimalDeposit,
      fee: wei(1, 25),
      feeTreasury: data[i].admin,
      startsAt: data[i].startsAt,
      withdrawLockPeriodAfterStake: data[i].withdrawLockPeriodAfterDeposit,
      maxClaimLockEnd:
        Number(data[i].claimLockEnd) < Number(data[i].startsAt) ? data[i].startsAt : data[i].claimLockEnd,
    };
    const metadata = {
      slug: data[i].description,
      description: '',
      website: data[i].website,
      image: '',
    };

    await builderSubnets.createSubnet(subnet, metadata);

    console.log(`Subnet ${data[i].name} created, index - ${i}`);
  }
};

const moveUsersStakes = async (buildersV3: BuildersV3, from = 0, to = 0) => {
  const configPath = `deploy/builders-protocol/data/subnets.json`;

  const data = JSON.parse(readFileSync(configPath, 'utf-8')) as Subnet[];
  to = to === 0 ? data.length : to;

  for (let i = from; i < to; i++) {
    const subnetIds = data[i].users.map(() => data[i].id);
    await buildersV3.migrateUsersStake(subnetIds, data[i].users);

    console.log(`Subnet users ${data[i].name} migrated`);
  }
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --only 3
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network base --only 3 --verify
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network arbitrum --only 3 --verify

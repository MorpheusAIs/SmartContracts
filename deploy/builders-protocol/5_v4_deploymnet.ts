import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  BuildersTreasuryV2,
  BuildersTreasuryV2__factory,
  BuildersV4,
  BuildersV4__factory,
  ERC1967Proxy__factory,
  RewardPool,
  RewardPool__factory,
} from '@/generated-types/ethers';
import { getRealRewardsPools } from '@/test/helpers/distribution-helper';

interface Config {
  owner: string;
}
const baseConfig: Config = {
  owner: '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E',
};

// const arbConfig: Config = {
//   owner: '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E',
// };

module.exports = async function (deployer: Deployer) {
  const config = baseConfig;

  const rewardPool = await _deployAndSetupRewardPool(deployer);
  const buildersTreasuryV2Impl = await _deployBuildersTreasuryV2Impl(deployer);
  const buildersV4Impl = await _deployBuildersV4Impl(deployer);

  await rewardPool.transferOwnership(config.owner);

  Reporter.reportContracts(
    ['BuildersTreasuryV2Impl', await buildersTreasuryV2Impl.getAddress()],
    ['BuildersV4Impl', await buildersV4Impl.getAddress()],
    ['RewardPool', await rewardPool.getAddress()],
  );
};

const _deployBuildersTreasuryV2Impl = async (deployer: Deployer): Promise<BuildersTreasuryV2> => {
  const impl = await deployer.deploy(BuildersTreasuryV2__factory);

  return impl;
};

const _deployBuildersV4Impl = async (deployer: Deployer): Promise<BuildersV4> => {
  const impl = await deployer.deploy(BuildersV4__factory);

  return impl;
};

const _deployAndSetupRewardPool = async (deployer: Deployer): Promise<RewardPool> => {
  const pools = getRealRewardsPools();

  console.log(RewardPool__factory.createInterface().encodeFunctionData('RewardPool_init', [pools]));

  const impl = await deployer.deploy(RewardPool__factory);
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await impl.getAddress(), RewardPool__factory.createInterface().encodeFunctionData('RewardPool_init', [pools])],
    {
      name: `RewardPool Proxy`,
    },
  );
  const contract = await deployer.deployed(RewardPool__factory, await proxy.getAddress());

  return contract;
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --only 5
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network base --only 5 --verify
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network arbitrum --only 5 --verify

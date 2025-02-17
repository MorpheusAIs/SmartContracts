import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { readFileSync } from 'fs';
import { ethers } from 'hardhat';

import {
  BuilderSubnets,
  BuilderSubnets__factory,
  ERC1967Proxy__factory,
  FeeConfig,
  FeeConfig__factory,
  MOROFT__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

type BuildersTestnetSepoliaConfig = {
  feeConfig: {
    feeTreasury: string;
    baseFee: number;
  };
  mor: string;
  builders: {
    treasury: string;
    minWithdrawLockPeriodAfterStake: number;
    maxShareForNetwork: number;
    builderPoolData: {
      initialAmount: number;
      decreaseAmount: number;
      payoutStart: number;
      interval: number;
    };
    feeClaimOperation: number;
  };
};

module.exports = async function (deployer: Deployer) {
  const impl = await deployer.deployed(BuilderSubnets__factory, '0xCB27aC872bfF99b643c9276041FA4b3CCC713759');
  const buildersOwner = await ethers.getImpersonatedSigner('0x19ec1E4b714990620edf41fE28e9a1552953a7F4');
  await impl
    .connect(buildersOwner)
    .stake(
      '0xf3d24210a53e1859e496dd5650f88bc2f9350365c36cd1134da30bd613f6d873',
      '0x19ec1E4b714990620edf41fE28e9a1552953a7F4',
      '2345678000000000000',
      '1739217600',
    );

  // const config = JSON.parse(
  //   readFileSync('deploy/data/config_builders_testnet_sepolia.json', 'utf-8'),
  // ) as BuildersTestnetSepoliaConfig;

  // const feeConfig = await deployFeeConfig(deployer, config);
  // const builderSubnets = await deployBuildersSubnets(deployer, config, await feeConfig.getAddress());

  // const mor = await deployer.deployed(MOROFT__factory, config.mor);
  // await mor.approve(await builderSubnets.getAddress(), wei(99999));

  // await feeConfig.setFeeForOperation(
  //   await builderSubnets.getAddress(),
  //   await builderSubnets.FEE_CLAIM_OPERATION(),
  //   wei(config.builders.feeClaimOperation / 100, 25),
  // );

  // await builderSubnets.createSubnet(
  //   {
  //     name: 'OF Builder #1',
  //     owner: (await deployer.getSigner()).getAddress(),
  //     minStake: wei(0.2345678),
  //     fee: wei(0.0875, 25),
  //     feeTreasury: (await deployer.getSigner()).getAddress(),
  //     startsAt: Math.floor(Date.now() / 1000) + 300,
  //     withdrawLockPeriodAfterStake: config.builders.minWithdrawLockPeriodAfterStake,
  //     minClaimLockEnd: Math.floor(Date.now() / 1000) + 3000,
  //   },
  //   {
  //     slug: 'Initiative being developed in collaboration between faculty and students from UCLA and other leading universities worldwide.',
  //     description:
  //       'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi sodales metus et ipsum gravida malesuada. Donec maximus mattis pellentesque. Etiam vitae pulvinar felis, id auctor risus. Duis condimentum dolor quis bibendum consequat. Nunc dolor lacus, bibendum a varius in, faucibus eget justo. Suspendisse lobortis nunc et nibh faucibus iaculis. In finibus fringilla consequat. Fusce quis sagittis mi. Suspendisse in laoreet eros.',
  //     website: 'https://www.lipsum.com/feed/html',
  //     image:
  //       'https://media.istockphoto.com/id/814423752/photo/eye-of-model-with-colorful-art-make-up-close-up.jpg?s=612x612&w=0&k=20&c=l15OdMWjgCKycMMShP8UK94ELVlEGvt7GmB_esHWPYE=',
  //   },
  // );

  // Reporter.reportContracts(
  //   ['FeeConfig', await feeConfig.getAddress()],
  //   ['BuilderSubnets', await builderSubnets.getAddress()],
  // );
};

const deployBuildersSubnets = async (
  deployer: Deployer,
  config: BuildersTestnetSepoliaConfig,
  feeConfigAddress: string,
): Promise<BuilderSubnets> => {
  const impl = await deployer.deploy(BuilderSubnets__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuilderSubnets',
  });
  const contract = await deployer.deployed(BuilderSubnets__factory, await proxy.getAddress());
  await contract.BuilderSubnets_init(
    config.mor,
    feeConfigAddress,
    config.builders.treasury,
    config.builders.minWithdrawLockPeriodAfterStake,
  );
  await contract.setMaxStakedShareForBuildersPool(wei(config.builders.maxShareForNetwork / 100, 25));
  const builderPoolData = {
    initialAmount: wei(config.builders.builderPoolData.initialAmount),
    decreaseAmount: wei(config.builders.builderPoolData.decreaseAmount),
    interval: config.builders.builderPoolData.interval,
    payoutStart: config.builders.builderPoolData.payoutStart,
  };
  await contract.setBuildersPoolData(builderPoolData);
  const rewardCalculationStartsAt = Math.floor(Date.now() / 1000) + 300;
  await contract.setRewardCalculationStartsAt(rewardCalculationStartsAt);
  await contract.setIsMigrationOver(true);

  return contract;
};

const deployFeeConfig = async (deployer: Deployer, config: BuildersTestnetSepoliaConfig): Promise<FeeConfig> => {
  const impl = await deployer.deploy(FeeConfig__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'FeeConfig',
  });
  const feeConfig = await deployer.deployed(FeeConfig__factory, await proxy.getAddress());

  const baseFee = wei(config.feeConfig.baseFee / 100, 25);
  await feeConfig.FeeConfig_init(config.feeConfig.feeTreasury, baseFee);

  return feeConfig;
};

// npx hardhat migrate --only 14
// npx hardhat migrate --network arbitrum_sepolia --only 14 --verify
// npx hardhat migrate --network arbitrum_sepolia --only 14 --continue --verify

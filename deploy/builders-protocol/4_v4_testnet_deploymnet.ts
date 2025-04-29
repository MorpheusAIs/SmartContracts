import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  BuilderSubnets,
  BuilderSubnets__factory,
  BuildersV3,
  BuildersV3__factory,
  ERC1967Proxy__factory,
  FeeConfig,
  FeeConfig__factory,
  MOROFT__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const config = {
  feeConfig: {
    address: '0x926993CF1FFE3978500d95Db591AC7a58D33c772',
  },
  mor: '0x5C80Ddd187054E1E4aBBfFCD750498e81d34FfA3',
  builders: {
    treasury: '0x19ec1E4b714990620edf41fE28e9a1552953a7F4',
    minWithdrawLockPeriodAfterStake: 300,
    subnetCreationFee: {
      amount: wei(0.123456789),
      treasury: '0xe3E8B64331636c04a0272eB831A856029Af7816c',
    },
    builderPoolData: {
      initialAmount: wei(3456),
      decreaseAmount: wei(0.59255872824),
      payoutStart: 1707393600,
      interval: 86400,
    },
    feeClaimOperation: wei(0.1175, 25),
  },
};

module.exports = async function (deployer: Deployer) {
  const signer = await deployer.getSigner();

  // const feeConfig = await deployer.deployed(FeeConfig__factory, config.feeConfig.address);
  // const builderSubnets = await deployBuildersSubnets(deployer, await feeConfig.getAddress());

  // await feeConfig.setFeeForOperation(
  //   await builderSubnets.getAddress(),
  //   await builderSubnets.FEE_CLAIM_OPERATION(),
  //   config.builders.feeClaimOperation,
  // );

  // Reporter.reportContracts(['BuilderSubnets', await builderSubnets.getAddress()]);

  // PART 2
  const builderSubnets = await deployer.deployed(BuilderSubnets__factory, '0x5C80Ddd187054E1E4aBBfFCD750498e81d34FfA3');
  await createSubnetAndStake(deployer, await signer.getAddress(), builderSubnets);
};

const deployBuildersSubnets = async (deployer: Deployer, feeConfigAddress: string): Promise<BuilderSubnets> => {
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
    await deployBuildersV3(deployer),
  );

  await contract.setBuildersRewardPoolData(config.builders.builderPoolData);

  const rewardCalculationStartsAt = Math.floor(Date.now() / 1000) + 300;
  await contract.setRewardCalculationStartsAt(rewardCalculationStartsAt);

  const creationFee = config.builders.subnetCreationFee;
  await contract.setSubnetCreationFee(creationFee.amount, creationFee.treasury);

  return contract;
};

const deployBuildersV3 = async (deployer: Deployer): Promise<BuildersV3> => {
  const impl = await deployer.deploy(BuildersV3__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuildersV3',
  });
  const contract = await deployer.deployed(BuildersV3__factory, await proxy.getAddress());

  return contract;
};

const createSubnetAndStake = async (deployer: Deployer, signerAddress: string, builderSubnets: BuilderSubnets) => {
  const mor = await deployer.deployed(MOROFT__factory, config.mor);
  await mor.approve(await builderSubnets.getAddress(), wei(99999));

  await builderSubnets.createSubnet(
    {
      name: 'OF Builder #1',
      owner: signerAddress,
      minStake: wei(0.2345678),
      fee: wei(0.0875, 25),
      feeTreasury: signerAddress,
      startsAt: Math.floor(Date.now() / 1000) - 100,
      withdrawLockPeriodAfterStake: config.builders.minWithdrawLockPeriodAfterStake,
    },
    {
      slug: 'Initiative being developed in collaboration between faculty and students from UCLA and other leading universities worldwide.',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi sodales metus et ipsum gravida malesuada. Donec maximus mattis pellentesque. Etiam vitae pulvinar felis, id auctor risus. Duis condimentum dolor quis bibendum consequat. Nunc dolor lacus, bibendum a varius in, faucibus eget justo. Suspendisse lobortis nunc et nibh faucibus iaculis. In finibus fringilla consequat. Fusce quis sagittis mi. Suspendisse in laoreet eros.',
      website: 'https://www.lipsum.com/feed/html',
      image:
        'https://media.istockphoto.com/id/814423752/photo/eye-of-model-with-colorful-art-make-up-close-up.jpg?s=612x612&w=0&k=20&c=l15OdMWjgCKycMMShP8UK94ELVlEGvt7GmB_esHWPYE=',
    },
  );

  await builderSubnets.setIsMigrationOver(true);
  await builderSubnets.stake(await builderSubnets.getSubnetId('OF Builder #1'), signerAddress, wei(0.2345678));
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --only 4
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network base_sepolia --only 4 --verify

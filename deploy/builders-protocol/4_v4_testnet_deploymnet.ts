import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  BuildersTreasuryV2,
  BuildersTreasuryV2__factory,
  BuildersV4,
  BuildersV4__factory,
  ERC1967Proxy__factory,
  FeeConfig__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const config = {
  feeConfig: '0x926993cf1ffe3978500d95db591ac7a58d33c772',
  mor: '0x5C80Ddd187054E1E4aBBfFCD750498e81d34FfA3',
  rewardPool: '0x10777866547c53CBD69b02c5c76369d7e24e7b10',
  builders: {
    networkShare: wei(0.8, 25),
    networkShareOwner: '0x19ec1E4b714990620edf41fE28e9a1552953a7F4',
    minWithdrawLockPeriodAfterStake: 300,
    subnetCreationFee: {
      amount: wei(0.123456789),
      treasury: '0xe3E8B64331636c04a0272eB831A856029Af7816c',
    },
    feeClaimOperation: wei(0.1175, 25),
  },
};

module.exports = async function (deployer: Deployer) {
  // const signer = await deployer.getSigner();

  const feeConfig = await deployer.deployed(FeeConfig__factory, config.feeConfig);
  const buildersTreasuryV2 = await deployAndSetupBuildersTreasuryV2(deployer);
  const buildersV4 = await deployAndSetupBuildersV4(deployer, buildersTreasuryV2);

  await buildersTreasuryV2.setBuilders(await buildersV4.getAddress());

  await feeConfig.setFeeForOperation(
    await buildersV4.getAddress(),
    await buildersV4.FEE_CLAIM_OPERATION(),
    config.builders.feeClaimOperation,
  );

  Reporter.reportContracts(['BuildersTreasuryV2', await buildersTreasuryV2.getAddress()]);
  Reporter.reportContracts(['BuildersV4', await buildersV4.getAddress()]);
};

const deployAndSetupBuildersTreasuryV2 = async (deployer: Deployer): Promise<BuildersTreasuryV2> => {
  const impl = await deployer.deploy(BuildersTreasuryV2__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuildersTreasuryV2',
  });
  const contract = await deployer.deployed(BuildersTreasuryV2__factory, await proxy.getAddress());
  await contract.BuildersTreasuryV2_init(config.mor);

  return contract;
};

const deployAndSetupBuildersV4 = async (
  deployer: Deployer,
  buildersTreasuryV2: BuildersTreasuryV2,
): Promise<BuildersV4> => {
  const impl = await deployer.deploy(BuildersV4__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'BuildersV4',
  });
  const contract = await deployer.deployed(BuildersV4__factory, await proxy.getAddress());
  await contract.BuildersV4_init(
    config.mor,
    config.feeConfig,
    buildersTreasuryV2,
    config.rewardPool,
    config.builders.networkShareOwner,
    config.builders.minWithdrawLockPeriodAfterStake,
  );

  await contract.setNetworkShare(config.builders.networkShare);
  await contract.setSubnetCreationFeeAmount(config.builders.subnetCreationFee.amount);

  return contract;
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --only 4
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network base_sepolia --only 4 --verify

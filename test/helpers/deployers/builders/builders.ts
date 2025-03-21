import { ethers } from 'hardhat';

import { Builders, BuildersTreasury, FeeConfig, MOROFT } from '@/generated-types/ethers';

export const deployBuilders = async (
  stakeToken: MOROFT,
  feeConfig: FeeConfig,
  editPoolDeadline: number,
  minimalWithdrawLockPeriod: number,
): Promise<{ builders: Builders; buildersTreasury: BuildersTreasury }> => {
  const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
  const [lib2] = await Promise.all([await lib2Factory.deploy()]);

  const [implBuildersFactory, implBuildersTreasuryFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('Builders', {
      libraries: {
        LockMultiplierMath: await lib2.getAddress(),
      },
    }),
    ethers.getContractFactory('BuildersTreasury'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const implBuilders = await implBuildersFactory.deploy();
  const implBuildersTreasury = await implBuildersTreasuryFactory.deploy();
  const buildersProxy = await proxyFactory.deploy(implBuilders, '0x');
  const buildersTreasuryProxy = await proxyFactory.deploy(implBuildersTreasury, '0x');

  const builders = implBuilders.attach(buildersProxy) as Builders;
  const buildersTreasury = implBuildersTreasury.attach(buildersTreasuryProxy) as BuildersTreasury;

  await builders.Builders_init(stakeToken, feeConfig, buildersTreasury, editPoolDeadline, minimalWithdrawLockPeriod);
  await buildersTreasury.BuildersTreasury_init(stakeToken, builders);

  return { builders, buildersTreasury };
};

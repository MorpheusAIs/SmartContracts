import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import {
  BuildersTreasuryV2,
  BuildersV4,
  FeeConfig,
  MOROFT,
  RewardPool,
  RewardPoolMock,
} from '@/generated-types/ethers';

export const deployBuildersV4 = async (
  depositToken: MOROFT,
  feeConfig: FeeConfig,
  buildersTreasury: BuildersTreasuryV2,
  rewardPool: RewardPool | RewardPoolMock,
  networkShareOwner: SignerWithAddress,
  minimalWithdrawLockPeriod: number,
): Promise<BuildersV4> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('BuildersV4'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as BuildersV4;

  await contract.BuildersV4_init(
    await depositToken.getAddress(),
    await feeConfig.getAddress(),
    await buildersTreasury.getAddress(),
    await rewardPool.getAddress(),
    await networkShareOwner.getAddress(),
    minimalWithdrawLockPeriod,
  );

  return contract;
};

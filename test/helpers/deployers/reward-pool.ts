import { ethers } from 'hardhat';

import { IRewardPool, RewardPool } from '@/generated-types/ethers';

export const deployRewardPool = async (rewardPools: IRewardPool.RewardPoolStruct[]): Promise<RewardPool> => {
  const [lib1Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('LinearDistributionIntervalDecrease'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const lib1 = await lib1Factory.deploy();

  const implFactory = await ethers.getContractFactory('RewardPool', {
    libraries: {
      LinearDistributionIntervalDecrease: await lib1.getAddress(),
    },
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as RewardPool;

  await contract.RewardPool_init(rewardPools);

  return contract;
};

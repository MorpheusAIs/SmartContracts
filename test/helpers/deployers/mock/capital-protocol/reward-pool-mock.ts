import { ethers } from 'hardhat';

import { RewardPoolMock } from '@/generated-types/ethers';

export const deployRewardPoolMock = async (): Promise<RewardPoolMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('RewardPoolMock')]);

  const contract = await factory.deploy();

  return contract;
};

import { ethers } from 'hardhat';

import { DistributorMock, ERC20Token, RewardPoolMock } from '@/generated-types/ethers';

export const deployDistributorMock = async (
  rewardPoolMock: RewardPoolMock,
  rewardToken: ERC20Token,
): Promise<DistributorMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('DistributorMock')]);

  const contract = await factory.deploy(rewardPoolMock, rewardToken);

  return contract;
};

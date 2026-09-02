import { ethers } from 'hardhat';

import { DistributorV3Mock, ERC20Token, RewardPoolMock } from '@/generated-types/ethers';

export const deployDistributorV3Mock = async (
  rewardPoolMock: RewardPoolMock,
  rewardToken: ERC20Token,
): Promise<DistributorV3Mock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('DistributorV3Mock')]);

  const contract = await factory.deploy(rewardPoolMock, rewardToken);

  return contract;
};

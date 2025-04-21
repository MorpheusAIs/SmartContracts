import { ethers } from 'hardhat';

import { UniswapSwapRouterMock } from '@/generated-types/ethers';

export const deployUniswapSwapRouterMock = async (): Promise<UniswapSwapRouterMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('UniswapSwapRouterMock')]);

  const contract = await factory.deploy();

  return contract;
};

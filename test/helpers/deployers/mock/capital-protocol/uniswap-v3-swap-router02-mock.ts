import { ethers } from 'hardhat';

import { UniswapV3SwapRouter02Mock } from '@/generated-types/ethers';

export const deployUniswapV3SwapRouter02Mock = async (): Promise<UniswapV3SwapRouter02Mock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('UniswapV3SwapRouter02Mock')]);

  const contract = await factory.deploy();

  return contract;
};

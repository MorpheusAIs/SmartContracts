import { ethers } from 'hardhat';

import { StETHMock, WStETHMock } from '@/generated-types/ethers';

export const deployWstETHMock = async (stETH: StETHMock): Promise<WStETHMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('WStETHMock')]);

  const contract = await factory.deploy(stETH);

  return contract;
};

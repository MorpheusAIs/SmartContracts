import { ethers } from 'hardhat';

import { StETHMock } from '@/generated-types/ethers';

export const deployStETHMock = async (): Promise<StETHMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('StETHMock')]);

  const contract = await factory.deploy();

  return contract;
};

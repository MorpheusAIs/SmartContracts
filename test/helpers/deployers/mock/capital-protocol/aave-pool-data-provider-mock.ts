import { ethers } from 'hardhat';

import { AavePoolDataProviderMock } from '@/generated-types/ethers';

export const deployAavePoolDataProviderMock = async (): Promise<AavePoolDataProviderMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('AavePoolDataProviderMock')]);

  const contract = await factory.deploy();

  return contract;
};

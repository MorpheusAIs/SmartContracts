import { ethers } from 'hardhat';

import { AavePoolDataProviderMock, AavePoolMock } from '@/generated-types/ethers';

export const deployAavePoolMock = async (aavePoolDataProviderMock: AavePoolDataProviderMock): Promise<AavePoolMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('AavePoolMock')]);

  const contract = await factory.deploy(aavePoolDataProviderMock);

  return contract;
};

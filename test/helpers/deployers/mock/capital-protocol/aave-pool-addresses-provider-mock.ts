import { ethers } from 'hardhat';

import { AavePoolAddressesProviderMock } from '@/generated-types/ethers';

export const deployAavePoolAddressesProviderMock = async (): Promise<AavePoolAddressesProviderMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('AavePoolAddressesProviderMock')]);

  const contract = await factory.deploy();

  return contract;
};

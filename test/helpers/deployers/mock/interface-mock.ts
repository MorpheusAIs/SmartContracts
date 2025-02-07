import { ethers } from 'hardhat';

import { InterfaceMock } from '@/generated-types/ethers';

export const deployInterfaceMock = async (): Promise<InterfaceMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('InterfaceMock')]);

  const contract = await factory.deploy();

  return contract;
};

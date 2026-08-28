import { ethers } from 'hardhat';

import { L1StandardBridgeMock } from '@/generated-types/ethers';

export const deployL1StandardBridgeMock = async (): Promise<L1StandardBridgeMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('L1StandardBridgeMock')]);

  const contract = await factory.deploy();

  return contract;
};

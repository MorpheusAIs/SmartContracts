import { ethers } from 'hardhat';

import { LZEndpointMock } from '@/generated-types/ethers';

export const deployLZEndpointMock = async (chainId: number): Promise<LZEndpointMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('LZEndpointMock')]);

  const contract = await factory.deploy(chainId);

  return contract;
};

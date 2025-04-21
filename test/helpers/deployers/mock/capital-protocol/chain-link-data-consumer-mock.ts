import { ethers } from 'hardhat';

import { ChainLinkDataConsumerMock } from '@/generated-types/ethers';

export const deployChainLinkDataConsumerMock = async (): Promise<ChainLinkDataConsumerMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('ChainLinkDataConsumerMock')]);

  const contract = await factory.deploy();

  return contract;
};

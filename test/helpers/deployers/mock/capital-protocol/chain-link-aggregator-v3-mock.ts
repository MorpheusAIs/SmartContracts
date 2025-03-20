import { ethers } from 'hardhat';

import { ChainLinkAggregatorV3Mock } from '@/generated-types/ethers';

export const deployChainLinkAggregatorV3Mock = async (decimals: number): Promise<ChainLinkAggregatorV3Mock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('ChainLinkAggregatorV3Mock')]);

  const contract = await factory.deploy(decimals);

  return contract;
};

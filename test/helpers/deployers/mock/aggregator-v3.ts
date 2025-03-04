import { ethers } from 'hardhat';

import { AggregatorV3 } from '@/generated-types/ethers';

export const deployAggregatorV3 = async (): Promise<AggregatorV3> => {
  const [factory] = await Promise.all([ethers.getContractFactory('AggregatorV3')]);

  const contract = await factory.deploy();

  return contract;
};

import { ethers } from 'hardhat';

import { SimpleMessageLib } from '@/generated-types/ethers';

export const deploySimpleMessageLib = async (endpoint: string, treasury: string): Promise<SimpleMessageLib> => {
  const [factory] = await Promise.all([ethers.getContractFactory('SimpleMessageLib')]);

  const contract = await factory.deploy(endpoint, treasury);

  return contract;
};

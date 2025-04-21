import { ethers } from 'hardhat';

import { ERC20Token } from '@/generated-types/ethers';

export const deployERC20Token = async (): Promise<ERC20Token> => {
  const [factory] = await Promise.all([ethers.getContractFactory('ERC20Token')]);

  const contract = await factory.deploy();

  return contract;
};

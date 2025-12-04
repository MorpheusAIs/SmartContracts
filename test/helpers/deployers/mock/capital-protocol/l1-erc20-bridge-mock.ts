import { ethers } from 'hardhat';

import { L1ERC20BridgeMock } from '@/generated-types/ethers';

export const deployL1ERC20BridgeMock = async (): Promise<L1ERC20BridgeMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('L1ERC20BridgeMock')]);

  const contract = await factory.deploy();

  return contract;
};

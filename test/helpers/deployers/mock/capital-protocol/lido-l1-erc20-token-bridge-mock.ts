import { ethers } from 'hardhat';

import { LidoL1ERC20TokenBridgeMock } from '@/generated-types/ethers';

export const deployLidoL1ERC20TokenBridgeMock = async (): Promise<LidoL1ERC20TokenBridgeMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('LidoL1ERC20TokenBridgeMock')]);

  const contract = await factory.deploy();

  return contract;
};

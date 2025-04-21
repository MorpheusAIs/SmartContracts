import { ethers } from 'hardhat';

import { L2MessageReceiver } from '@/generated-types/ethers';

export const deployL2MessageReceiver = async (): Promise<L2MessageReceiver> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('L2MessageReceiver'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as L2MessageReceiver;

  await contract.L2MessageReceiver__init();

  return contract;
};

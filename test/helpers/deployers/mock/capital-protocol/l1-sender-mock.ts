import { ethers } from 'hardhat';

import { L1SenderMock } from '@/generated-types/ethers';

export const deployL1SenderMock = async (): Promise<L1SenderMock> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('L1SenderMock'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as L1SenderMock;

  return contract;
};

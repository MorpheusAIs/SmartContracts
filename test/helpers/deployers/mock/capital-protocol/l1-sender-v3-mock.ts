import { ethers } from 'hardhat';

import { L1SenderV3Mock } from '@/generated-types/ethers';

export const deployL1SenderV3Mock = async (): Promise<L1SenderV3Mock> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('L1SenderV3Mock'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as L1SenderV3Mock;

  return contract;
};

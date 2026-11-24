import { ethers } from 'hardhat';

import { L1SenderV3 } from '@/generated-types/ethers';

export const deployL1SenderV3 = async (): Promise<L1SenderV3> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('L1SenderV3'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as L1SenderV3;

  await contract.L1SenderV3__init();

  return contract;
};

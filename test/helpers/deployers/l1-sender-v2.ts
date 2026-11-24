import { ethers } from 'hardhat';

import { L1SenderV2 } from '@/generated-types/ethers';

export const deployL1SenderV2 = async (): Promise<L1SenderV2> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('L1SenderV2'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as L1SenderV2;

  await contract.L1SenderV2__init();

  return contract;
};

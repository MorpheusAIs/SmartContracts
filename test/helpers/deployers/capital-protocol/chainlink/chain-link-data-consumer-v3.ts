import { ethers } from 'hardhat';

import { ChainLinkDataConsumerV3 } from '@/generated-types/ethers';

export const deployChainLinkDataConsumerV3 = async (): Promise<ChainLinkDataConsumerV3> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('ChainLinkDataConsumerV3'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as ChainLinkDataConsumerV3;

  await contract.ChainLinkDataConsumerV3_init();

  return contract;
};

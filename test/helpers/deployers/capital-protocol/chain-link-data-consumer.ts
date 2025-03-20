import { ethers } from 'hardhat';

import { ChainLinkDataConsumer } from '@/generated-types/ethers';

export const deployChainLinkDataConsumer = async (): Promise<ChainLinkDataConsumer> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('ChainLinkDataConsumer'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as ChainLinkDataConsumer;

  await contract.ChainLinkDataConsumer_init();

  return contract;
};

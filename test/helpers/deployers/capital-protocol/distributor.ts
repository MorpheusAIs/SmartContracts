import { ethers } from 'hardhat';

import { ChainLinkDataConsumerV3, Distributor } from '@/generated-types/ethers';

export const deployDistributor = async (chainLinkDataConsumerV3: ChainLinkDataConsumerV3): Promise<Distributor> => {
  const [lib1Factory] = await Promise.all([ethers.getContractFactory('LinearDistributionIntervalDecrease')]);
  const lib1 = await lib1Factory.deploy();

  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('Distributor', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib1.getAddress(),
      },
    }),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as Distributor;

  await contract.Distributor_init(chainLinkDataConsumerV3);

  return contract;
};

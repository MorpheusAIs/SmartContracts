import { ethers } from 'hardhat';

import { DepositPool, ERC20Token } from '@/generated-types/ethers';

export const deployDepositPool = async (token: ERC20Token): Promise<DepositPool> => {
  const [lib1Factory, lib2Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('LinearDistributionIntervalDecrease'),
    ethers.getContractFactory('ReferrerLib'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const lib1 = await lib1Factory.deploy();
  const lib2 = await lib2Factory.deploy();

  const implFactory = await ethers.getContractFactory('DepositPool', {
    libraries: {
      LinearDistributionIntervalDecrease: await lib1.getAddress(),
      ReferrerLib: await lib2.getAddress(),
    },
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DepositPool;

  await contract.DepositPool_init(token);

  return contract;
};

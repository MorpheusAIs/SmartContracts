import { ethers } from 'hardhat';

import { DepositPool, Distributor, DistributorMock, ERC20Token, StETHMock } from '@/generated-types/ethers';

export const deployDepositPool = async (
  token: ERC20Token | StETHMock,
  distributor: Distributor | DistributorMock,
): Promise<DepositPool> => {
  const [lib1Factory, lib2Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('ReferrerLib'),
    ethers.getContractFactory('LockMultiplierMath'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const [lib1, lib2] = await Promise.all([await lib1Factory.deploy(), await lib2Factory.deploy()]);

  const implFactory = await ethers.getContractFactory('DepositPool', {
    libraries: {
      ReferrerLib: await lib1.getAddress(),
      LockMultiplierMath: await lib2.getAddress(),
    },
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DepositPool;

  await contract.DepositPool_init(token, distributor);

  return contract;
};

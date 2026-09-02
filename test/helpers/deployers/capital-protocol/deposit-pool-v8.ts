import { ethers } from 'hardhat';

import { DepositPoolV8, DistributorV3, DistributorV3Mock, ERC20Token, StETHMock } from '@/generated-types/ethers';

export const deployDepositPoolV8 = async (
  token: ERC20Token | StETHMock,
  distributor: DistributorV3 | DistributorV3Mock,
): Promise<DepositPoolV8> => {
  const [lib1Factory, lib2Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('ReferrerLib'),
    ethers.getContractFactory('LockMultiplierMath'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const [lib1, lib2] = await Promise.all([await lib1Factory.deploy(), await lib2Factory.deploy()]);

  const implFactory = await ethers.getContractFactory('DepositPoolV8', {
    libraries: {
      ReferrerLib: await lib1.getAddress(),
      LockMultiplierMath: await lib2.getAddress(),
    },
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DepositPoolV8;

  await contract.DepositPoolV8_init(token, distributor);

  return contract;
};

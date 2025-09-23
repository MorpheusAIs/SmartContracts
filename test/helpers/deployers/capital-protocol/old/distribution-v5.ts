import { AddressLike } from 'ethers';
import { ethers } from 'hardhat';

import { DistributionV5, ERC20Token, StETHMock } from '@/generated-types/ethers';

export const deployDistributionV5 = async (
  depositToken: ERC20Token | StETHMock,
  l1Sender: AddressLike,
): Promise<DistributionV5> => {
  const [lib1Factory, lib2Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('LinearDistributionIntervalDecrease'),
    ethers.getContractFactory('ReferrerLib'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const [lib1, lib2] = await Promise.all([lib1Factory.deploy(), lib2Factory.deploy()]);

  const implFactory = await ethers.getContractFactory('DistributionV5', {
    libraries: {
      LinearDistributionIntervalDecrease: await lib1.getAddress(),
      ReferrerLib: await lib2.getAddress(),
    },
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DistributionV5;

  await contract.Distribution_init(depositToken, l1Sender, []);

  return contract;
};

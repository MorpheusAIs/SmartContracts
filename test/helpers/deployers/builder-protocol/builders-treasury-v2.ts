import { ethers } from 'hardhat';

import { BuildersTreasuryV2, MOROFT } from '@/generated-types/ethers';

export const deployBuildersTreasuryV2 = async (rewardToken: MOROFT): Promise<BuildersTreasuryV2> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('BuildersTreasuryV2'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as BuildersTreasuryV2;

  await contract.BuildersTreasuryV2_init(await rewardToken.getAddress());

  return contract;
};

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import { FeeConfig } from '@/generated-types/ethers';

export const deployFeeConfig = async (feeTreasury: SignerWithAddress, baseFee = 0): Promise<FeeConfig> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('FeeConfig'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as FeeConfig;

  await contract.FeeConfig_init(feeTreasury, baseFee);

  return contract;
};

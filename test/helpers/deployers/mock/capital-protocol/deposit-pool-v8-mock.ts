import { ethers } from 'hardhat';

import { DepositPoolV8Mock, DistributorV3, ERC20Token, StETHMock } from '@/generated-types/ethers';

export const deployDepositPoolV8Mock = async (
  depositToken: ERC20Token | StETHMock,
  distributor: DistributorV3,
): Promise<DepositPoolV8Mock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('DepositPoolV8Mock')]);

  const contract = await factory.deploy(distributor, depositToken);

  return contract;
};

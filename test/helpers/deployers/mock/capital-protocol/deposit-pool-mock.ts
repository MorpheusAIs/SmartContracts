import { ethers } from 'hardhat';

import { DepositPoolMock, Distributor, DistributorV2, ERC20Token, StETHMock } from '@/generated-types/ethers';

export const deployDepositPoolMock = async (
  depositToken: ERC20Token | StETHMock,
  distributor: Distributor | DistributorV2,
): Promise<DepositPoolMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('DepositPoolMock')]);

  const contract = await factory.deploy(distributor, depositToken);

  return contract;
};

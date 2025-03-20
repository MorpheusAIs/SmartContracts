import { ethers } from 'hardhat';

import { DepositPoolMock, Distributor, ERC20Token } from '@/generated-types/ethers';

export const deployDepositPoolMock = async (
  depositToken: ERC20Token,
  distributor: Distributor,
): Promise<DepositPoolMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('DepositPoolMock')]);

  const contract = await factory.deploy(distributor, depositToken);

  return contract;
};

import { ethers } from 'hardhat';

import { TransferMock } from '@/generated-types/ethers';

export const deployTransferMock = async (): Promise<TransferMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('TransferMock')]);

  const contract = await factory.deploy();

  return contract;
};

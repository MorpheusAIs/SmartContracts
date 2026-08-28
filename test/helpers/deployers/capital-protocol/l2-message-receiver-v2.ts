import { ethers } from 'hardhat';

import { L2MessageReceiverV2 } from '@/generated-types/ethers';

export const deployL2MessageReceiverV2 = async (
  endpoint: string,
  delegate: string,
  rewardToken: string,
): Promise<L2MessageReceiverV2> => {
  const [factory] = await Promise.all([ethers.getContractFactory('L2MessageReceiverV2')]);

  const contract = await factory.deploy(endpoint, delegate, rewardToken);

  return contract;
};

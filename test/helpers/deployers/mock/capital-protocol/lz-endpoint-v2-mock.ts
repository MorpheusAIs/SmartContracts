import { ethers } from 'hardhat';

import { LayerZeroEndpointV2Mock } from '@/generated-types/ethers';

export const deployLayerZeroEndpointV2Mock = async (
  eid: number,
  owner: string,
): Promise<LayerZeroEndpointV2Mock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('LayerZeroEndpointV2Mock')]);

  const contract = await factory.deploy(eid, owner);

  return contract;
};

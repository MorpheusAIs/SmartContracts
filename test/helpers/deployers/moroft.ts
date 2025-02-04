import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import { MOROFT } from '@/generated-types/ethers';

export const deployMOROFT = async (
  chainId: number,
  lzEndpointOwner: SignerWithAddress,
  delegate: SignerWithAddress,
  minter: SignerWithAddress,
): Promise<MOROFT> => {
  const [moroftFactory, LayerZeroEndpointV2MockFactory] = await Promise.all([
    ethers.getContractFactory('MOROFT'),
    ethers.getContractFactory('LayerZeroEndpointV2Mock'),
  ]);

  const LayerZeroEndpointV2Mock = await LayerZeroEndpointV2MockFactory.deploy(chainId, lzEndpointOwner);

  return await moroftFactory.deploy(LayerZeroEndpointV2Mock, delegate, minter);
};

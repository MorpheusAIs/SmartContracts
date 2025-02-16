import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { oneDay } from './distribution-helper';

import { IBuilderSubnets, IBuilders } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

export const getDefaultBuilderPool = (admin: SignerWithAddress): IBuilders.BuilderPoolStruct => {
  return {
    name: 'Test Pool',
    admin: admin,
    poolStart: oneDay,
    withdrawLockPeriodAfterDeposit: oneDay,
    claimLockEnd: 10 * oneDay,
    minimalDeposit: wei(0.1),
  };
};

export const getDefaultSubnet = (
  owner: SignerWithAddress,
  feeTreasury: SignerWithAddress,
): IBuilderSubnets.BuildersSubnetStruct => {
  return {
    name: 'Test Pool #1',
    owner: owner,
    minStake: wei(1),
    fee: wei(0.2, 25),
    feeTreasury: feeTreasury,
    startsAt: 100 * oneDay,
    withdrawLockPeriodAfterStake: 2 * oneDay,
    maxClaimLockEnd: 200 * oneDay,
  };
};

export const getDefaultSubnetMetadata = (): IBuilderSubnets.BuildersSubnetMetadataStruct => {
  return {
    slug: 'Slug',
    description: 'Description',
    website: 'Website',
    image: 'Image',
  };
};

export const getDefaultBuildersPoolData = () => {
  return {
    initialAmount: wei(200),
    decreaseAmount: wei(1),
    payoutStart: 90 * oneDay,
    interval: oneDay,
  };
};

// https://etherscan.io/address/0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790#readProxyContract
export const getRealBuildersPoolData = () => {
  return {
    initialAmount: wei(3456),
    decreaseAmount: wei(0.59255872824),
    payoutStart: 1707393600,
    interval: 86400,
  };
};

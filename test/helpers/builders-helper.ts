import { Addressable } from 'ethers';

import { IBuilders } from '@/generated-types/ethers';
import { ETHER_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

export const oneHour = 3600;
export const oneDay = 86400;

export const getDefaultBuilderPool = (admin: Addressable): IBuilders.BuilderPoolStruct => {
  return {
    project: ETHER_ADDR,
    admin: admin,
    poolStart: oneDay,
    withdrawLockPeriodAfterStake: oneDay,
    minimalStake: wei(0.1),
  };
};

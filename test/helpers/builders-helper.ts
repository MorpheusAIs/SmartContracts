import { Addressable } from 'ethers';

import { oneDay } from './distribution-helper';

import { IBuilders } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

export const getDefaultBuilderPool = (admin: Addressable): IBuilders.BuilderPoolStruct => {
  return {
    name: 'Test Pool',
    admin: admin,
    poolStart: oneDay,
    withdrawLockPeriodAfterDeposit: oneDay,
    claimLockEnd: 10 * oneDay,
    minimalDeposit: wei(0.1),
  };
};

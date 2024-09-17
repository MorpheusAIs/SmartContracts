import { IDistribution, IL2TokenReceiver } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

export const oneHour = 3600;
export const oneDay = 86400;

export const getDefaultPool = (): IDistribution.PoolStruct => {
  return {
    payoutStart: oneDay,
    decreaseInterval: oneDay,
    withdrawLockPeriod: 12 * oneHour,
    claimLockPeriod: 12 * oneHour,
    withdrawLockPeriodAfterStake: oneDay,
    initialReward: wei(100),
    rewardDecrease: wei(2),
    minimalStake: wei(0.1),
    isPublic: true,
  };
};

export const getDefaultSwapParams = (tokenIn: string, tokenOut: string): IL2TokenReceiver.SwapParamsStruct => {
  return {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: 500,
    sqrtPriceLimitX96: 0,
  };
};

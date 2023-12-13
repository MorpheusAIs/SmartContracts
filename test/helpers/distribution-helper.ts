import { IDistribution, ISwap } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

export const oneHour = 3600;
export const oneDay = 86400;

export const getDefaultPool = (): IDistribution.PoolStruct => {
  return {
    payoutStart: oneDay,
    decreaseInterval: oneDay,
    withdrawLockPeriod: 12 * oneHour,
    claimLockPeriod: 12 * oneHour,
    initialReward: wei(100),
    rewardDecrease: wei(2),
    minimalStake: wei(0.1),
    isPublic: true,
  };
};

export const getDefaultSwapParams = (
  tokenIn: string,
  tokenOut: string,
  intermediateToken: string,
): ISwap.SwapParamsStruct => {
  return {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    intermediateToken: intermediateToken,
    fee: 500,
    sqrtPriceLimitX96: 0,
  };
};

import { IDistribution, ISwap } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import type { Addressable } from 'ethers';

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

export const addressMinusAlias = async (account: Addressable): Promise<string> => {
  return '0x' + (BigInt(await account.getAddress()) - 0x1111000000000000000000000000000000001111n).toString(16);
};

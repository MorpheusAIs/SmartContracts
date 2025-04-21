import { IDistribution, IDistributionV5, IL2TokenReceiver } from '@/generated-types/ethers';
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

export const getDefaultReferrerTiers = (): IDistributionV5.ReferrerTierStruct[] => {
  return [
    {
      amount: 0,
      multiplier: wei(0.01, 25),
    },
    {
      amount: wei(35),
      multiplier: wei(0.025, 25),
    },
    {
      amount: wei(350),
      multiplier: wei(0.0375, 25),
    },
    {
      amount: wei(3500),
      multiplier: wei(0.05, 25),
    },
  ];
};

export const getDefaultSwapParams = (tokenIn: string, tokenOut: string): IL2TokenReceiver.SwapParamsStruct => {
  return {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: 500,
    sqrtPriceLimitX96: 0,
  };
};

export const getDefaultRewardsPools = () => {
  return [
    {
      payoutStart: oneDay,
      decreaseInterval: oneDay,
      initialReward: wei(100),
      rewardDecrease: wei(2),
      lastCalculatedTimestamp: oneDay,
    },
    {
      payoutStart: oneDay * 10,
      decreaseInterval: oneDay * 2,
      initialReward: wei(1000),
      rewardDecrease: wei(4),
      lastCalculatedTimestamp: oneDay * 10,
    },
  ];
};

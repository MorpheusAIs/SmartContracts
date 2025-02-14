import { BigNumberish } from 'ethers';
import { readFileSync } from 'fs';

import { IDistribution } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';

export type Config = {
  chainsConfig: {
    senderChainId: number;
    receiverChainId: number;
  };
  pools?: PoolInitInfo[];
  L1?: {
    stEth: string;
    wStEth: string;
  };
  L2?: {
    swapRouter: string;
    nonfungiblePositionManager: string;
    wStEth: string;
  };
  swapParams: {
    fee: string;
    sqrtPriceLimitX96: string;
  };
  arbitrumConfig?: {
    arbitrumBridgeGatewayRouter: string;
  };
  lzConfig?: {
    lzEndpointL1: string;
    lzEndpointL2: string;
  };
};

type PoolInitInfo = IDistribution.PoolStruct & {
  whitelistedUsers: string[];
  amounts: BigNumberish[];
};

export function parseConfig(file?: string): Config {
  const configPath = `deploy/data/${file ?? 'config.json'}`;

  const config: Config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;

  if (config.chainsConfig == undefined) {
    throw new Error(`Invalid 'chainsConfig' value.`);
  }
  if (config.chainsConfig.receiverChainId == undefined) {
    throw new Error(`Invalid 'chainsConfig.receiverChainId' value.`);
  }
  if (config.chainsConfig.senderChainId == undefined) {
    throw new Error(`Invalid 'chainsConfig.senderChainId' value.`);
  }

  if (config.pools != undefined) {
    validatePools(config.pools);
  }

  if (config.L1 != undefined) {
    if (config.L1.stEth == undefined) {
      nonZeroAddr(config.L1.stEth, 'L1.stEth');
    }

    if (config.L1.wStEth == undefined) {
      nonZeroAddr(config.L1.wStEth, 'L1.wStEth');
    }
  }

  if (config.L2 != undefined) {
    if (config.L2.swapRouter == undefined) {
      nonZeroAddr(config.L2.swapRouter, 'L2.swapRouter');
    }

    if (config.L2.nonfungiblePositionManager == undefined) {
      nonZeroAddr(config.L2.nonfungiblePositionManager, 'L2.nonfungiblePositionManager');
    }

    if (config.L2.wStEth == undefined) {
      nonZeroAddr(config.L2.wStEth, 'L2.wStEth');
    }
  }

  if (
    config.swapParams == undefined ||
    nonNumber(config.swapParams.fee) ||
    nonNumber(config.swapParams.sqrtPriceLimitX96)
  ) {
    throw new Error('Invalid `swapParams`');
  }

  if (config.lzConfig != undefined) {
    if (config.lzConfig.lzEndpointL1 == undefined) {
      throw new Error('Invalid `lzConfig.lzEndpointL1`');
    }
    if (config.lzConfig.lzEndpointL2 == undefined) {
      throw new Error('Invalid `lzConfig.lzEndpointL2`');
    }
  }

  if (config.arbitrumConfig != undefined) {
    if (config.arbitrumConfig.arbitrumBridgeGatewayRouter == undefined) {
      throw new Error('Invalid `arbitrumConfig.arbitrumBridgeGatewayRouter`');
    }
  }

  return config;
}

function nonNumber(value: BigNumberish) {
  return !(typeof value === 'number' || typeof value === 'bigint' || typeof BigInt(value) === 'bigint');
}

function nonZeroAddr(filedDataRaw: string | undefined, filedName: string) {
  if (isZeroAddr(filedDataRaw)) {
    throw new Error(`Invalid ${filedName} filed.`);
  }
}

function isZeroAddr(filedDataRaw: string | undefined) {
  return isEmptyField(filedDataRaw) || filedDataRaw === ZERO_ADDR;
}

function isEmptyField(filedDataRaw: string | undefined) {
  return !filedDataRaw || filedDataRaw == '';
}

function validatePools(pools: PoolInitInfo[]) {
  pools.forEach((pool: PoolInitInfo) => {
    if (
      nonNumber(pool.payoutStart) ||
      nonNumber(pool.decreaseInterval) ||
      nonNumber(pool.withdrawLockPeriod) ||
      nonNumber(pool.claimLockPeriod) ||
      typeof pool.isPublic !== 'boolean' ||
      nonNumber(pool.initialReward) ||
      nonNumber(pool.rewardDecrease) ||
      nonNumber(pool.minimalStake)
    ) {
      throw new Error(`Invalid pool.`);
    }

    if (pool.whitelistedUsers != undefined) {
      if (pool.amounts == undefined || pool.amounts.length != pool.whitelistedUsers.length) {
        throw new Error(`Invalid pool amounts.`);
      }

      if (pool.isPublic) {
        if ((pool.whitelistedUsers && pool.whitelistedUsers.length > 0) || (pool.amounts && pool.amounts.length > 0)) {
          throw new Error(`Invalid pool whitelistedUsers.`);
        }
      } else {
        pool.whitelistedUsers.forEach((user: string) => {
          nonZeroAddr(user, 'whitelistedUsers');
        });
        pool.amounts.forEach((amount: BigNumberish) => {
          if (nonNumber(amount)) {
            throw new Error(`Invalid pool amounts.`);
          }
        });
      }
    } else {
      if (pool.amounts != undefined) {
        throw new Error(`Invalid pool amounts.`);
      }
    }
  });
}

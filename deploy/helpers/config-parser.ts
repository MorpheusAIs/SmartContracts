import { IDistribution } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { BigNumberish } from 'ethers';
import { readFileSync } from 'fs';

export type Config = {
  cap: number;
  pools?: PoolInitInfo[];
};

export type PoolInitInfo = IDistribution.PoolStruct & {
  whitelistedUsers?: string[];
  amounts?: BigNumberish[];
};

export function parseConfig(configPath: string = 'deploy/data/config.json'): Config {
  const config: Config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;

  if (config.cap == undefined) {
    throw new Error(`Invalid 'cap' value.`);
  }

  if (config.pools != undefined) {
    validatePools(config.pools);
  }

  return config;
}

function nonNumber(value: BigNumberish) {
  return !(typeof value === 'number' || typeof value === 'bigint' || typeof BigInt(value) === 'bigint');
}

function toNumber(value: BigNumberish) {
  return BigInt(value);
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

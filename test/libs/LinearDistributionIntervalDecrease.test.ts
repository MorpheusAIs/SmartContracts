import { expect } from 'chai';
import { ethers } from 'hardhat';

import { DistributionV2Mock, IDistribution } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { getDefaultPool, oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('LinearDistributionIntervalDecrease', () => {
  const reverter = new Reverter();

  let distribution: DistributionV2Mock;

  before(async () => {
    const [libFactory] = await Promise.all([ethers.getContractFactory('LinearDistributionIntervalDecrease')]);
    const lib = await libFactory.deploy();

    const distributionFactory = await ethers.getContractFactory('DistributionV2Mock', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    });

    distribution = await distributionFactory.deploy();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('#getPeriodReward', () => {
    let pool0: IDistribution.PoolStruct;
    let pool1: IDistribution.PoolStruct;
    let pool2: IDistribution.PoolStruct;
    let pool3: IDistribution.PoolStruct;

    beforeEach(async () => {
      const defaultPool = getDefaultPool();

      pool0 = { ...defaultPool };
      pool0.payoutStart = 24 * oneHour + oneHour;
      pool0.decreaseInterval = 8 * oneHour;
      pool0.initialReward = wei(100);
      pool0.rewardDecrease = wei(2);

      pool1 = { ...pool0 };
      pool1.payoutStart = 20 * oneHour;

      pool2 = { ...pool0 };
      pool2.rewardDecrease = wei(50);

      pool3 = { ...pool0 };
      pool3.rewardDecrease = wei(51);
    });

    it('should return 0 if decreaseInterval == 0', async () => {
      const pool: IDistribution.PoolStruct = {
        ...pool0,
        rewardDecrease: 0,
        decreaseInterval: 0,
      };

      await distribution.createPool(pool);

      const reward = await distribution.getPeriodReward(0, pool.payoutStart, 99999);
      expect(reward).to.eq(wei(0));
    });

    it('should return 0 if interval == 0', async () => {
      const pool: IDistribution.PoolStruct = {
        ...pool0,
        decreaseInterval: 0,
      };

      await distribution.createPool(pool);

      const reward = await distribution.getPeriodReward(0, pool.payoutStart, 99999);
      expect(reward).to.eq(wei(0));
    });

    it('should return correct rewards in a pool where `payoutStart % decreaseInterval = 0`', async () => {
      await distribution.createPool(pool0);

      await _testRewardsCalculation(distribution, 0, Number(pool0.payoutStart.toString()));
    });

    it('should return correct rewards in a pool where `payoutStart % decreaseInterval != 0`', async () => {
      await distribution.createPool(pool1);

      await _testRewardsCalculation(distribution, 0, Number(pool1.payoutStart.toString()));
    });

    it('should return correct rewards, check limit time values for `initialReward % rewardDecrease == 0`', async () => {
      await distribution.createPool(pool2);

      let reward;
      const payoutStart = Number(pool2.payoutStart.toString());

      reward = await distribution.getPeriodReward(0, payoutStart - 2 * oneHour, payoutStart - 1 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart - 2 * oneHour, payoutStart - 0 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart + 998 * oneHour, payoutStart + 999 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart + 999 * oneHour, payoutStart + 998 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart - 1 * oneHour, payoutStart + 999 * oneHour);
      expect(reward).to.eq(wei(150));
    });

    it('should return correct rewards, check limit time values for `initialReward % rewardDecrease != 0`', async () => {
      await distribution.createPool(pool3);

      let reward;
      const payoutStart = Number(pool3.payoutStart.toString());

      reward = await distribution.getPeriodReward(0, payoutStart - 2 * oneHour, payoutStart - 1 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart - 2 * oneHour, payoutStart - 0 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart + 998 * oneHour, payoutStart + 999 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart + 999 * oneHour, payoutStart + 998 * oneHour);
      expect(reward).to.eq(wei(0));

      reward = await distribution.getPeriodReward(0, payoutStart - 1 * oneHour, payoutStart + 999 * oneHour);
      expect(reward).to.eq(wei(149));

      reward = await distribution.getPeriodReward(0, payoutStart + 12 * oneHour, payoutStart + 999 * oneHour);
      expect(reward).to.eq(wei(49 / 2));
    });
    it('should return correct rewards if `rewardDecrease` == 0', async () => {
      const pool: IDistribution.PoolStruct = {
        ...pool0,
        rewardDecrease: 0,
      };

      await distribution.createPool(pool);

      const poolId = 0;
      const payoutStart = Number(pool.payoutStart.toString());
      let reward;

      // Range in one interval, first interval
      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 2 * oneHour);
      expect(reward).to.eq(wei(25));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 6 * oneHour);
      expect(reward).to.eq(wei(75));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 6 * oneHour);
      expect(reward).to.eq(wei(50));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 8 * oneHour);
      expect(reward).to.eq(wei(75));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 8 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(
        poolId,
        payoutStart + 12352 * oneHour,
        payoutStart + (12352 + 8) * oneHour,
      );
      expect(reward).to.eq(wei(100));

      // Range in one interval, third interval
      reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 18 * oneHour);
      expect(reward).to.eq(wei(25));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 22 * oneHour);
      expect(reward).to.eq(wei(75));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 18 * oneHour, payoutStart + 22 * oneHour);
      expect(reward).to.eq(wei(50));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 18 * oneHour, payoutStart + 24 * oneHour);
      expect(reward).to.eq(wei(75));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 24 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(
        poolId,
        payoutStart + (12352 + 8) * oneHour,
        payoutStart + (12352 + 16) * oneHour,
      );
      expect(reward).to.eq(wei(100));

      // Range in two intervals, start from first
      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 10 * oneHour);
      expect(reward).to.eq(wei(125));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 10 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 4 * oneHour, payoutStart + 12 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 6 * oneHour, payoutStart + 14 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(
        poolId,
        payoutStart + (12352 + 6) * oneHour,
        payoutStart + (12352 + 14) * oneHour,
      );
      expect(reward).to.eq(wei(100));

      // Range in two intervals, start from second
      reward = await distribution.getPeriodReward(poolId, payoutStart + 8 * oneHour, payoutStart + 18 * oneHour);
      expect(reward).to.eq(wei(125));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 10 * oneHour, payoutStart + 18 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 12 * oneHour, payoutStart + 20 * oneHour);
      expect(reward).to.eq(wei(100));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 14 * oneHour, payoutStart + 24 * oneHour);
      expect(reward).to.eq(wei(125));

      reward = await distribution.getPeriodReward(
        poolId,
        payoutStart + (12352 + 14) * oneHour,
        payoutStart + (12352 + 24) * oneHour,
      );
      expect(reward).to.eq(wei(125));

      // Range in few intervals, start from first
      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 24 * oneHour);
      expect(reward).to.eq(wei(300));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 26 * oneHour);
      expect(reward).to.eq(wei(300));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 6 * oneHour, payoutStart + 30 * oneHour);
      expect(reward).to.eq(wei(300));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 12352 * oneHour);
      expect(reward).to.eq(wei(154400));

      // Range in few intervals, start from second
      reward = await distribution.getPeriodReward(poolId, payoutStart + 8 * oneHour, payoutStart + 24 * oneHour);
      expect(reward).to.eq(wei(200));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 10 * oneHour, payoutStart + 26 * oneHour);
      expect(reward).to.eq(wei(200));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 14 * oneHour, payoutStart + 30 * oneHour);
      expect(reward).to.eq(wei(200));

      reward = await distribution.getPeriodReward(poolId, payoutStart + 8 * oneHour, payoutStart + 12352 * oneHour);
      expect(reward).to.eq(wei(154300));
    });
  });
});

const _testRewardsCalculation = async (distribution: DistributionV2Mock, poolId: number, payoutStart: number) => {
  let reward;

  // Range in one interval, first interval
  reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 2 * oneHour);
  expect(reward).to.eq(wei(25));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 6 * oneHour);
  expect(reward).to.eq(wei(75));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 6 * oneHour);
  expect(reward).to.eq(wei(50));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 8 * oneHour);
  expect(reward).to.eq(wei(75));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 8 * oneHour);
  expect(reward).to.eq(wei(100));

  // Range in one interval, third interval
  reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 18 * oneHour);
  expect(reward).to.eq(wei(24));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 22 * oneHour);
  expect(reward).to.eq(wei(72));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 18 * oneHour, payoutStart + 22 * oneHour);
  expect(reward).to.eq(wei(48));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 18 * oneHour, payoutStart + 24 * oneHour);
  expect(reward).to.eq(wei(72));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 16 * oneHour, payoutStart + 24 * oneHour);
  expect(reward).to.eq(wei(96));

  // Range in two intervals, start from first
  reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 10 * oneHour);
  expect(reward).to.eq(wei(124.5));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 10 * oneHour);
  expect(reward).to.eq(wei(99.5));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 4 * oneHour, payoutStart + 12 * oneHour);
  expect(reward).to.eq(wei(99));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 6 * oneHour, payoutStart + 14 * oneHour);
  expect(reward).to.eq(wei(98.5));

  // Range in two intervals, start from second
  reward = await distribution.getPeriodReward(poolId, payoutStart + 8 * oneHour, payoutStart + 18 * oneHour);
  expect(reward).to.eq(wei(122));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 10 * oneHour, payoutStart + 18 * oneHour);
  expect(reward).to.eq(wei(97.5));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 12 * oneHour, payoutStart + 20 * oneHour);
  expect(reward).to.eq(wei(97));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 14 * oneHour, payoutStart + 24 * oneHour);
  expect(reward).to.eq(wei(120.5));

  // Range in few intervals, start from first
  reward = await distribution.getPeriodReward(poolId, payoutStart + 0 * oneHour, payoutStart + 24 * oneHour);
  expect(reward).to.eq(wei(294));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 2 * oneHour, payoutStart + 26 * oneHour);
  expect(reward).to.eq(wei(292.5));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 6 * oneHour, payoutStart + 30 * oneHour);
  expect(reward).to.eq(wei(289.5));

  // Range in few intervals, start from second
  reward = await distribution.getPeriodReward(poolId, payoutStart + 8 * oneHour, payoutStart + 24 * oneHour);
  expect(reward).to.eq(wei(194));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 10 * oneHour, payoutStart + 26 * oneHour);
  expect(reward).to.eq(wei(193));

  reward = await distribution.getPeriodReward(poolId, payoutStart + 14 * oneHour, payoutStart + 30 * oneHour);
  expect(reward).to.eq(wei(191));
};

// npx hardhat test "test/libs/LinearDistributionIntervalDecrease.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/libs/LinearDistributionIntervalDecrease.test.ts"

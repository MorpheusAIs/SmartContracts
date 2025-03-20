import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setTime } from '../helpers/block-helper';

import { DistributionExt, DistributionV2, L1SenderMock } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getDefaultPool, oneDay, oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('DistributionExt', () => {
  const reverter = new Reverter();

  let SECOND: SignerWithAddress;

  let distribution: DistributionV2;
  let distributionExt: DistributionExt;

  before(async () => {
    [, SECOND] = await ethers.getSigners();

    const [ERC1967ProxyFactory, LinearDistributionIntervalDecreaseFactory, DistributionExtFactory] = await Promise.all([
      ethers.getContractFactory('ERC1967Proxy'),
      ethers.getContractFactory('LinearDistributionIntervalDecrease'),
      ethers.getContractFactory('DistributionExt'),
    ]);

    const lib = await LinearDistributionIntervalDecreaseFactory.deploy();
    const distributionFactory = await ethers.getContractFactory('DistributionV2', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    });
    const distributionImpl = await distributionFactory.deploy();
    const distributionProxy = await ERC1967ProxyFactory.deploy(distributionImpl, '0x');
    distribution = distributionFactory.attach(distributionProxy) as DistributionV2;
    await distribution.Distribution_init(ZERO_ADDR, ZERO_ADDR, []);

    const distributionExtImpl = await DistributionExtFactory.deploy();
    const distributionExtProxy = await ERC1967ProxyFactory.deploy(distributionExtImpl, '0x');
    distributionExt = DistributionExtFactory.attach(distributionExtProxy) as DistributionExt;
    await distributionExt.DistributionExt_init(await distribution.getAddress(), [0]);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('#constructor', () => {
    it('should disable initialize function', async () => {
      const reason = 'Initializable: contract is already initialized';

      const distributionExt_ = await (await ethers.getContractFactory('DistributionExt')).deploy();

      await expect(distributionExt_.DistributionExt_init(await distribution.getAddress(), [0])).to.be.rejectedWith(
        reason,
      );
    });
  });

  describe('#DistributionExt_init', () => {
    it('should revert if try to call init function twice', async () => {
      const reason = 'Initializable: contract is already initialized';

      await expect(distributionExt.DistributionExt_init(await distribution.getAddress(), [0])).to.be.rejectedWith(
        reason,
      );
    });
    it('should setup config', async () => {
      expect(await distributionExt.distribution()).to.be.equal(await distribution.getAddress());
      expect(await distributionExt.poolIds(0)).to.be.deep.equal(0);
    });
  });

  describe('#_authorizeUpgrade', () => {
    it('should correctly upgrade', async () => {
      const V2Factory = await ethers.getContractFactory('L1SenderMock');
      const V2Implementation = await V2Factory.deploy();

      await distributionExt.upgradeTo(V2Implementation);

      const V2 = V2Factory.attach(distributionExt) as L1SenderMock;

      expect(await V2.version()).to.eq(666);
    });
    it('should revert if caller is not the owner', async () => {
      await expect(distributionExt.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('setDistribution', () => {
    it('should set distribution', async () => {
      await distributionExt.setDistribution(SECOND);
      expect(await distributionExt.distribution()).to.be.equal(SECOND.address);
    });
    it('should revert if not called by the owner', async () => {
      await expect(distributionExt.setDistribution(ZERO_ADDR)).to.be.revertedWith('DEXT: zero address');
    });
    it('should revert if not called by the owner', async () => {
      await expect(distributionExt.connect(SECOND).setDistribution(SECOND)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('setPoolIds', () => {
    it('should set pool ids', async () => {
      await distributionExt.setPoolIds([1, 2, 3]);
      expect(await distributionExt.poolIds(0)).to.be.equal(1);
      expect(await distributionExt.poolIds(1)).to.be.equal(2);
      expect(await distributionExt.poolIds(2)).to.be.equal(3);
    });
    it('should revert if not called by the owner', async () => {
      await expect(distributionExt.setPoolIds([])).to.be.revertedWith('DEXT: array is empty');
    });
    it('should revert if not called by the owner', async () => {
      await expect(distributionExt.connect(SECOND).setPoolIds([1, 2, 3])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#getTotalRewards', () => {
    it('should return correct rewards for the test pools', async () => {
      const defaultPool = getDefaultPool();

      const pool0 = { ...defaultPool };
      pool0.payoutStart = 24 * oneHour + oneHour;
      pool0.decreaseInterval = 8 * oneHour;
      pool0.initialReward = wei(100);
      pool0.rewardDecrease = wei(2);

      const pool1 = { ...pool0 };
      pool1.payoutStart = 32 * oneHour + oneHour;
      pool1.initialReward = wei(200);
      pool1.rewardDecrease = wei(2);

      await distribution.createPool(pool0);
      await distribution.createPool(pool1);
      await distributionExt.setPoolIds([0, 1]);

      let reward;

      const pool0PayoutStart = Number(pool0.payoutStart.toString());

      await setTime(pool0PayoutStart + 2 * oneHour);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(25));

      await setTime(pool0PayoutStart + 6 * oneHour);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(75));

      await setTime(pool0PayoutStart + 8 * oneHour);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(100));

      await setTime(pool0PayoutStart + 16 * oneHour);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(100 + 98 + 200));

      await setTime(pool0PayoutStart + 24 * oneHour);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(100 + 98 + 96 + 200 + 198));
    });

    it('should return correct rewards for the real pools', async () => {
      const pool = {
        ...getDefaultPool(),
        initialReward: wei(3456),
        rewardDecrease: wei(0.59255872824),
      };
      const poolProtection = {
        ...getDefaultPool(),
        initialReward: wei(576),
        rewardDecrease: wei(0.09875978804),
      };

      await distribution.createPool(pool);
      await distribution.createPool(pool);
      await distribution.createPool(pool);
      await distribution.createPool(pool);
      await distribution.createPool(poolProtection);
      await distributionExt.setPoolIds([0, 1, 2, 3, 4]);

      let reward;

      await setTime(oneDay + oneDay);
      reward = await distributionExt.getTotalRewards();
      expect(reward).to.eq(wei(14400));

      await setTime(oneDay + 1000 * oneDay);
      reward = await distributionExt.getTotalRewards();
      expect(reward).closeTo(wei(13166737.15), wei(0.01));

      await setTime(oneDay + 5833 * oneDay);
      reward = await distributionExt.getTotalRewards();
      expect(reward).closeTo(wei(42000000), wei(0.01));
    });
  });
});

// npx hardhat test "test/extensions/DistributionExt.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/extensions/DistributionExt.test.ts"

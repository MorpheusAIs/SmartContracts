import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployInterfaceMock, deployRewardPool } from '../helpers/deployers';
import { oneDay } from '../helpers/distribution-helper';

import { IRewardPool, RewardPool } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('RewardPool', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let rewardPool: RewardPool;

  const pools: IRewardPool.RewardPoolStruct[] = [
    {
      payoutStart: oneDay * 10,
      decreaseInterval: oneDay,
      initialReward: wei(100),
      rewardDecrease: wei(1),
      isPublic: true,
    },
    {
      payoutStart: oneDay * 20,
      decreaseInterval: oneDay * 2,
      initialReward: wei(200),
      rewardDecrease: wei(1),
      isPublic: false,
    },
  ];

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    rewardPool = await deployRewardPool(pools);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(rewardPool.connect(OWNER).RewardPool_init([])).to.be.revertedWith(reason);
      });
    });

    describe('#RewardPool_init', () => {
      it('should set correct data after creation', async () => {
        for (let i = 0; i < pools.length; i++) {
          const result = await rewardPool.rewardPools(i);
          expect(result.payoutStart).to.eq(pools[i].payoutStart);
          expect(result.decreaseInterval).to.eq(pools[i].decreaseInterval);
          expect(result.initialReward).to.eq(pools[i].initialReward);
          expect(result.rewardDecrease).to.eq(pools[i].rewardDecrease);
          expect(result.isPublic).to.eq(pools[i].isPublic);
        }
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should upgrade to the new version', async () => {
        const [factory] = await Promise.all([ethers.getContractFactory('FeeConfigV2')]);
        const contract = await factory.deploy();

        await rewardPool.upgradeTo(contract);
        expect(await rewardPool.version()).to.eq(2);
      });

      it('should revert if caller is not the owner', async () => {
        await expect(rewardPool.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('#version()', () => {
      it('should return correct version', async () => {
        expect(await rewardPool.version()).to.eq(1);
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IRewardPool', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await rewardPool.supportsInterface(await interfaceMock.getIRewardPoolInterfaceId())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await rewardPool.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#addRewardPool', () => {
    it('should add new reward pool', async () => {
      await rewardPool.addRewardPool({
        payoutStart: 1,
        decreaseInterval: 2,
        initialReward: 3,
        rewardDecrease: 4,
        isPublic: false,
      });

      const result = await rewardPool.rewardPools(2);
      expect(result.payoutStart).to.eq(1);
      expect(result.decreaseInterval).to.eq(2);
      expect(result.initialReward).to.eq(3);
      expect(result.rewardDecrease).to.eq(4);
      expect(result.isPublic).to.eq(false);
    });
    it('should revert when the implementation is invalid', async () => {
      await expect(rewardPool.addRewardPool({ ...pools[0], decreaseInterval: 0 })).to.be.revertedWith(
        'RP: invalid decrease interval',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(rewardPool.connect(SECOND).addRewardPool(pools[0])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#getters', () => {
    it('#isRewardPoolExist', async () => {
      expect(await rewardPool.isRewardPoolExist(0)).to.eq(true);
      expect(await rewardPool.isRewardPoolExist(1)).to.eq(true);
      expect(await rewardPool.isRewardPoolExist(2)).to.eq(false);
    });
    it('#isRewardPoolPublic', async () => {
      expect(await rewardPool.isRewardPoolPublic(0)).to.eq(pools[0].isPublic);
      expect(await rewardPool.isRewardPoolPublic(1)).to.eq(pools[1].isPublic);
    });
    it('#onlyExistedRewardPool', async () => {
      await rewardPool.onlyExistedRewardPool(1);
      await expect(rewardPool.onlyExistedRewardPool(2)).to.be.revertedWith("RP: the reward pool doesn't exist");
    });
    it('#onlyPublicRewardPool', async () => {
      await rewardPool.onlyPublicRewardPool(0);
      await expect(rewardPool.onlyPublicRewardPool(1)).to.be.revertedWith("RP: the pool isn't public");
    });
    it('#onlyNotPublicRewardPool', async () => {
      await rewardPool.onlyNotPublicRewardPool(1);
      await expect(rewardPool.onlyNotPublicRewardPool(0)).to.be.revertedWith('RP: the pool is public');
    });
  });

  describe('#getPeriodRewards', () => {
    it('should correctly calculate rewards', async () => {
      await rewardPool.addRewardPool({
        payoutStart: oneDay,
        decreaseInterval: oneDay,
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
        isPublic: false,
      });
      const rewardPoolId = 2;

      let reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 2);
      expect(reward).to.eq(wei(14400));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 3);
      expect(reward).to.eq(wei(28797.531005299));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 14);
      expect(reward).to.eq(wei(187007.418413322));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 202);
      expect(reward).to.eq(wei(2844773.2065099));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 5831);
      expect(reward).to.closeTo(wei(41999990.123144), wei(0.000001));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 5834);
      expect(reward).to.closeTo(wei(41999999.9988394), wei(0.000001));

      reward = await rewardPool.getPeriodRewards(rewardPoolId, oneDay, oneDay * 6000);
      expect(reward).to.closeTo(wei(41999999.9988394), wei(0.000001));
    });
    it("should return 0 if a reward pool doesn't exist", async () => {
      const reward = await rewardPool.getPeriodRewards(999, oneDay, oneDay * 2);
      expect(reward).to.eq(wei(0));
    });
  });
});

// npx hardhat test "test/capital-protocol/RewardPool.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/RewardPool.test.ts"

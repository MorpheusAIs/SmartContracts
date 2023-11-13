import {
  Distribution,
  DistributionV2,
  Distribution__factory,
  ERC20Mock,
  IDistribution,
  LinearDistributionIntervalDecrease,
  MOR,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getCurrentBlockTime, setNextTime, setTime } from './helpers/block-helper';

const oneHour = 3600;
const oneDay = 86400;

describe('Distribution', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let ownerAddress: string;
  let secondAddress: string;

  let distributionFactory: Distribution__factory;
  let distribution: Distribution;

  let lib: LinearDistributionIntervalDecrease;

  let rewardToken: MOR;
  let investToken: ERC20Mock;

  before(async () => {
    await setTime(oneHour);
    [OWNER, SECOND] = await ethers.getSigners();

    ownerAddress = await OWNER.getAddress();
    secondAddress = await SECOND.getAddress();

    const libFactory = await ethers.getContractFactory('LinearDistributionIntervalDecrease');
    lib = await libFactory.deploy();

    distributionFactory = await ethers.getContractFactory('Distribution', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    });
    const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy');

    const distributionImplementation = await distributionFactory.deploy();
    const distributionProxy = await ERC1967ProxyFactory.deploy(await distributionImplementation.getAddress(), '0x');

    const MORFactory = await ethers.getContractFactory('MOR');
    rewardToken = await MORFactory.deploy(await distributionProxy.getAddress(), wei(1000000000));

    const ERC20MockFactory = await ethers.getContractFactory('ERC20Mock');
    investToken = await ERC20MockFactory.deploy();

    distribution = distributionFactory.attach(await distributionProxy.getAddress()) as Distribution;

    await distribution.Distribution_init(rewardToken, investToken, []);

    await investToken.mint(await ownerAddress, wei(1000));
    await investToken.mint(await secondAddress, wei(1000));
    await investToken.approve(await distribution.getAddress(), wei(1000));
    await investToken.connect(SECOND).approve(await distribution.getAddress(), wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#Distribution_init', () => {
      it('should set correct data after creation', async () => {
        const rewardToken_ = await distribution.rewardToken();
        expect(rewardToken_).to.eq(await rewardToken.getAddress());

        const investToken_ = await distribution.investToken();
        expect(investToken_).to.eq(await investToken.getAddress());
      });
      it('should create pools with correct data', async () => {
        const pool1 = _getDefaultPool();
        const pool2 = {
          ...pool1,
          isPublic: false,
          minimalStake: wei(0),
          payoutStart: oneDay * 2,
          decreaseInterval: oneDay * 2,
        };

        const distribution = await distributionFactory.deploy();
        await distribution.Distribution_init(rewardToken, investToken, [pool1, pool2]);

        const pool1Data: IDistribution.PoolStruct = await distribution.pools(0);
        expect(_comparePoolStructs(pool1, pool1Data)).to.be.true;

        const pool2Data: IDistribution.PoolStruct = await distribution.pools(1);
        expect(_comparePoolStructs(pool2, pool2Data)).to.be.true;
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(distribution.Distribution_init(rewardToken, investToken, [])).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const distributionV2Factory = await ethers.getContractFactory('DistributionV2', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const distributionV2Implementation = await distributionV2Factory.deploy();

        await distribution.upgradeTo(await distributionV2Implementation.getAddress());

        const distributionV2 = distributionV2Factory.attach(await distribution.getAddress()) as DistributionV2;

        expect(await distributionV2.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(distribution.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });
      it('should revert if `isNotUpgradeable == true`', async () => {
        await distribution.removeUpgradeability();

        await expect(distribution.upgradeTo(ZERO_ADDR)).to.be.revertedWith("DS: upgrade isn't available");
      });
    });
  });

  describe('#createPool', () => {
    it('should create pool with correct data', async () => {
      const pool = _getDefaultPool();

      await distribution.createPool(pool);

      const poolData: IDistribution.PoolStruct = await distribution.pools(0);
      expect(_comparePoolStructs(pool, poolData)).to.be.true;
    });

    describe('should revert if try to create pool with incorrect data', () => {
      it('if `payoutStart == 0`', async () => {
        const pool = _getDefaultPool();
        pool.payoutStart = 0;

        await expect(distribution.createPool(pool)).to.be.rejectedWith('DS: invalid payout start value');
      });
      it('if `rewardDecrease > 0 && decreaseInterval == 0`', async () => {
        const pool = _getDefaultPool();
        pool.decreaseInterval = 0;

        await expect(distribution.createPool(pool)).to.be.rejectedWith('DS: invalid reward decrease');
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).createPool(_getDefaultPool())).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('#editPool', () => {
    const poolId = 0;
    let defaultPool: IDistribution.PoolStruct;

    beforeEach(async () => {
      defaultPool = _getDefaultPool();

      await distribution.createPool(_getDefaultPool());
    });

    it('should edit pool with correct data', async () => {
      const newPool = {
        ...defaultPool,
        payoutStart: 10 * oneDay,
        decreaseInterval: 10 * oneDay,
        withdrawLockPeriod: 10 * oneDay,
        initialReward: wei(111),
        rewardDecrease: wei(222),
        minimalStake: wei(333),
        isPublic: false,
      };

      await distribution.editPool(poolId, newPool);

      const poolData: IDistribution.PoolStruct = await distribution.pools(poolId);
      expect(_comparePoolStructs(newPool, poolData)).to.be.true;
    });

    describe('should revert if try to edit pool with incorrect data', () => {
      it('if `rewardDecrease > 0 && decreaseInterval == 0`', async () => {
        const newPool = { ...defaultPool, decreaseInterval: 0 };

        await expect(distribution.editPool(poolId, newPool)).to.be.rejectedWith('DS: invalid reward decrease');
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).editPool(poolId, _getDefaultPool())).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.editPool(1, _getDefaultPool())).to.be.revertedWith("DS: pool doesn't exist");
    });
  });

  describe('#changeWhitelistedUsers', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = { ..._getDefaultPool(), isPublic: false };

      await distribution.createPool(pool);
    });

    it('should correctly imitate stake and withdraw process', async () => {
      let userData;

      setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(wei(0));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      setNextTime(oneHour * 3);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(10), wei(1)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(10));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(wei(0));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly calculate and withdraw rewards', async () => {
      let userData;

      setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(20));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(0), wei(0)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(39.6), wei(0.001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(158.4), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly calculate rewards after partial stake', async () => {
      let userData;

      setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      // Stake after 1 day
      setNextTime(oneDay + oneDay * 1);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(5), wei(5)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(0), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(80));

      // Claim after 2 day
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(20 + 49));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(80 + 49), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution start and claim after', async () => {
      let userData;

      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(510));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(wei(2040));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution end and claim after', async () => {
      let userData;

      setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(130));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(wei(520));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change after distribution end', async () => {
      let userData;
      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(2), wei(5)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(0);
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(0);
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change both at and distribution end', async () => {
      let userData;

      setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(2), wei(5)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(0);
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(130));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(0);
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(520));
    });
    it('should correctly work if multiple changes in one block', async () => {
      let userData;

      setNextTime(oneHour * 2);

      await ethers.provider.send('evm_setAutomine', [false]);

      const tx1 = distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);
      const tx2 = distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(2), wei(1)]);
      const tx3 = distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(10), wei(0)]);
      const tx4 = distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(1), wei(4)]);

      await ethers.provider.send('evm_setAutomine', [true]);
      await ethers.provider.send('evm_mine', []);

      await expect(tx1).to.not.be.reverted;
      await expect(tx2).to.not.be.reverted;
      await expect(tx3).to.not.be.reverted;
      await expect(tx4).to.not.be.reverted;

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(20));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [secondAddress, ownerAddress], [wei(0), wei(0)]);

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(39.6), wei(0.001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(158.4), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.manageUsersInPrivatePool(1, [], [])).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is public', async () => {
      const pool = _getDefaultPool();

      await distribution.createPool(pool);

      await expect(distribution.manageUsersInPrivatePool(1, [], [])).to.be.revertedWith('DS: pool is public');
    });
    it('should revert if lengths of arrays are not equal', async () => {
      await expect(distribution.manageUsersInPrivatePool(poolId, [secondAddress], [])).to.be.revertedWith(
        'DS: invalid length'
      );

      await expect(distribution.manageUsersInPrivatePool(poolId, [], [wei(1)])).to.be.revertedWith(
        'DS: invalid length'
      );
    });
  });

  describe('#stake', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = _getDefaultPool();
      await distribution.createPool(pool);
    });

    it('should stake correctly', async () => {
      // A stakes 1 token
      let tx = await distribution.stake(poolId, wei(1));
      let userData = await distribution.usersData(await ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      let poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalInvested).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      tx = await distribution.stake(poolId, wei(3));
      userData = await distribution.usersData(await OWNER.getAddress(), poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalInvested).to.eq(wei(4));
      expect(poolData.rate).to.eq(wei(100, 25));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      tx = await distribution.connect(SECOND).stake(poolId, wei(8));
      userData = await distribution.usersData(await SECOND.getAddress(), poolId);
      expect(userData.invested).to.eq(wei(8));
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalInvested).to.eq(wei(12));
      expect(poolData.rate).to.eq(wei(124.5, 25));
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.stake(1, wei(1))).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is private', async () => {
      const pool = { ..._getDefaultPool(), isPublic: false };
      await distribution.createPool(pool);
      await expect(distribution.stake(1, wei(1))).to.be.revertedWith("DS: pool isn't public");
    });
    it('should revert if amount is less than minimal stake', async () => {
      const pool = { ..._getDefaultPool(), minimalStake: wei(2) };
      await distribution.createPool(pool);
      await expect(distribution.stake(1, wei(1))).to.be.revertedWith('DS: amount too low');
    });
    it('should revert if amount is equal zero', async () => {
      await expect(distribution.stake(poolId, 0)).to.be.revertedWith('DS: nothing to stake');
    });
  });

  describe('#claim', () => {
    const poolId = 0;

    beforeEach(async () => {
      await distribution.createPool(_getDefaultPool());
    });

    it('should correctly claim, one user, without reinvests', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(198));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(294));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(570));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with reinvests', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Reinvestment 1 day after the start of reward payment
      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(100));

      // Claim after 1.5 days
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(149));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Reinvestment 4 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(149));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(239));

      // Claim after 5.25 days
      await setNextTime(oneDay + oneDay * 5.25);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(149 + 353.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      let userData;

      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(98));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, without reinvests', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER); // The reward will be slightly larger since the calculation is a second later.

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(124.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5 + 72), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(124.5 + 24), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5 + 72 + 207), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(124.5 + 24 + 69), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with reinvests', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Reinvestment 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2));

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Reinvestment 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001)
      );
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with reinvests', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Reinvestment 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2));

      expect(await rewardToken.balanceOf(secondAddress)).to.eq(wei(0));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Reinvestment 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001)
      );
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim zero reward when poll reward is zero', async () => {
      let userData;

      const newPool = {
        ..._getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      await setNextTime(oneDay + oneDay * 2);
      await distribution.editPool(poolId, newPool);

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 24.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly continue claim reward after pool stop (zero reward)', async () => {
      let userData;

      const newPool = {
        ..._getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      await setNextTime(oneDay + oneDay * 2);
      await distribution.editPool(poolId, newPool);

      await setNextTime(oneDay + oneDay * 3);
      await distribution.editPool(poolId, _getDefaultPool());

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5 + 70.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 24.5 + 23.5), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.claim(1, SECOND)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it("should revert if user didn't stake", async () => {
      await expect(distribution.claim(poolId, SECOND)).to.be.revertedWith("DS: user isn't staked");
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1));

      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith('DS: pool claim is locked');
    });
    it('should revert if nothing to claim', async () => {
      const newPool = {
        ..._getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneHour * 3);
      await distribution.editPool(poolId, newPool);

      await setNextTime(oneDay + oneDay);
      await expect(distribution.claim(poolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
    });
    it('should correctly claim, real data', async () => {
      let reward;

      const newPool = {
        ..._getDefaultPool(),
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
      };

      const [, , COMMUNITY, CODERS, COMPUTE, CAPITAL, PROTECTION] = await ethers.getSigners();

      await investToken.mint(await COMMUNITY.getAddress(), wei(1000));
      await investToken.connect(COMMUNITY).approve(await distribution.getAddress(), wei(1000));
      await investToken.mint(await CODERS.getAddress(), wei(1000));
      await investToken.connect(CODERS).approve(await distribution.getAddress(), wei(1000));
      await investToken.mint(await COMPUTE.getAddress(), wei(1000));
      await investToken.connect(COMPUTE).approve(await distribution.getAddress(), wei(1000));
      await investToken.mint(await CAPITAL.getAddress(), wei(1000));
      await investToken.connect(CAPITAL).approve(await distribution.getAddress(), wei(1000));
      await investToken.mint(await PROTECTION.getAddress(), wei(1000));
      await investToken.connect(PROTECTION).approve(await distribution.getAddress(), wei(1000));

      await setNextTime(oneHour * 2);
      await distribution.editPool(poolId, newPool);
      await distribution.createPool(newPool);

      await setNextTime(oneHour * 4);
      await distribution.connect(COMMUNITY).stake(poolId, wei(24));
      await distribution.connect(CODERS).stake(poolId, wei(24));
      await distribution.connect(COMPUTE).stake(poolId, wei(24));
      await distribution.connect(CAPITAL).stake(poolId, wei(24));
      await distribution.connect(PROTECTION).stake(poolId, wei(4));

      await distribution.connect(COMMUNITY).stake(1, wei(1));

      await setTime(oneDay + oneDay);
      reward = await distribution.getCurrentUserReward(poolId, COMMUNITY);
      expect(reward).to.eq(wei(3456));

      await setTime(oneDay + oneDay * 3000);
      reward = await distribution.getCurrentUserReward(poolId, COMMUNITY);
      expect(reward).to.closeTo(wei(7702374.56), wei(0.1));

      await setTime(oneDay + oneDay * 5833);
      reward = await distribution.getCurrentUserReward(poolId, COMMUNITY);
      expect(reward).to.closeTo(wei(10080000), wei(0.001));

      // Totally will be minted
      await setTime(oneDay + oneDay * 9999);
      reward = await distribution.getCurrentUserReward(1, COMMUNITY);
      expect(reward).to.closeTo(wei(42000000), wei(0.01));
    });
  });

  describe('#withdraw', () => {
    const poolId = 0;

    beforeEach(async () => {
      await distribution.createPool(_getDefaultPool());
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(OWNER).withdraw(poolId, wei(999));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(0));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await distribution.claim(poolId, SECOND);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(73.5), wei(0.000001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 24.5 + 96), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).withdraw(poolId, wei(999));

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 24.5 + 96 + 94), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith("DS: user isn't staked");
      await expect(distribution.claim(poolId, SECOND)).to.be.revertedWith("DS: user isn't staked");
    });
    it('should correctly withdraw, few users, withdraw part', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(4));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(6));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(OWNER).withdraw(poolId, wei(2));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000 - 6 + 2));
      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(58.8), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(58.8 + 48), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 39.2 + 48), wei(0.000001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).withdraw(poolId, wei(2));

      expect(await investToken.balanceOf(secondAddress)).to.eq(wei(1000 - 4 + 2));
      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 39.2 + 48 + 47), wei(0.001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));

      // Claim after 5 days
      await setNextTime(oneDay + oneDay * 5);
      await distribution.claim(poolId, SECOND);
      await distribution.claim(poolId, OWNER);

      expect(await rewardToken.balanceOf(ownerAddress)).to.closeTo(wei(58.8 + 48 + 47 + 61.33333), wei(0.001));
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(secondAddress)).to.closeTo(wei(100 + 39.2 + 48 + 47 + 30.66666), wei(0.001));
      userData = await distribution.usersData(secondAddress, poolId);
      expect(userData.invested).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly withdraw, when pool is no started', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      await setNextTime(oneHour * 3);
      await distribution.connect(OWNER).withdraw(poolId, wei(4));

      expect(await investToken.balanceOf(ownerAddress)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(ownerAddress)).to.eq(0);
      userData = await distribution.usersData(ownerAddress, poolId);
      expect(userData.invested).to.eq(wei(0));
    });
    it("should revert if user didn't stake", async () => {
      await expect(distribution.withdraw(poolId, 1)).to.be.revertedWith("DS: user isn't staked");
    });
    it("should revert if pool isn't found", async () => {
      await expect(distribution.withdraw(111, 1)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1));

      await expect(distribution.withdraw(poolId, wei(0.99))).to.be.revertedWith('DS: invalid withdraw amount');
    });
    it('should revert if pool is private', async () => {
      const pool = { ..._getDefaultPool(), isPublic: false };
      await distribution.createPool(pool);
      await expect(distribution.withdraw(1, wei(1))).to.be.revertedWith("DS: pool isn't public");
    });
  });

  describe('#removeUpgradeability', () => {
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).removeUpgradeability()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
    it('should remove upgradeability', async () => {
      let isNotUpgradeable = await distribution.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.false;

      await distribution.removeUpgradeability();

      isNotUpgradeable = await distribution.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.true;
    });
  });

  describe('#getPeriodReward', () => {
    it('should return 0 if pool is not exist', async () => {
      const reward = await distribution.getPeriodReward(0, 0, 99999);

      expect(reward).to.eq(0);
    });
  });

  describe('#getCurrentUserReward', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = _getDefaultPool();

      await distribution.createPool(pool);
    });

    it("should correctly calculate distribution rewards if pool if pool hasn't started", async () => {
      const reward = await distribution.getCurrentUserReward(poolId, OWNER);

      expect(reward).to.eq(0);
    });
    it("should correctly calculate distribution rewards if user didn't stake", async () => {
      await setTime(oneDay * 2);
      const reward = await distribution.getCurrentUserReward(poolId, OWNER);

      expect(reward).to.eq(0);
    });
    it('should correctly calculate distribution rewards if user staked before pool start', async () => {
      await distribution.stake(poolId, wei(2));

      await setTime(oneDay);

      const reward = await distribution.getCurrentUserReward(poolId, OWNER);

      expect(reward).to.eq(0);
    });
    it('should correctly calculate distribution rewards for 1 user', async () => {
      await distribution.stake(poolId, wei(2));
      let reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(0);

      await setTime(oneDay + oneDay);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(100));

      await setTime(oneDay + oneDay * 2);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(198));

      await setNextTime(oneDay + oneDay * 3);
      await distribution.withdraw(poolId, wei(1));

      await setTime(oneDay + oneDay * 4);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(94));

      await setNextTime(oneDay + oneDay * 5);
      await distribution.withdraw(poolId, wei(1));
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(0));

      await setNextTime(oneDay + oneDay * 7);
      await distribution.stake(poolId, wei(1));

      await setTime(oneDay + oneDay * 8);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(86));
    });
    it('should correctly calculate distribution rewards if user staked with pool start', async () => {
      await distribution.stake(poolId, wei(2));

      await setTime(oneDay);

      let rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      let rewardSecond = await distribution.connect(SECOND).getCurrentUserReward(poolId, OWNER);
      expect(rewardFirst).to.eq(0);
      expect(rewardSecond).to.eq(0);

      await setTime(oneDay + oneDay * 0.5);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(rewardFirst).to.eq(wei(50));

      await setNextTime(oneDay + oneDay);

      await distribution.connect(SECOND).stake(poolId, wei(3));

      await setTime(oneDay + oneDay * 2);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      rewardSecond = await distribution.getCurrentUserReward(poolId, SECOND);

      expect(rewardFirst).to.eq(wei(100 + 39.2));
      expect(rewardSecond).to.eq(wei(58.8));

      await setTime(oneDay + oneDay * 2.5);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      rewardSecond = await distribution.getCurrentUserReward(poolId, SECOND);

      expect(rewardFirst).to.eq(wei(100 + 58.4));
      expect(rewardSecond).to.eq(wei(87.6));

      await setNextTime(oneDay + oneDay * 3);

      await distribution.connect(SECOND).withdraw(poolId, wei(1));

      await setTime(oneDay + oneDay * 4);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      rewardSecond = await distribution.getCurrentUserReward(poolId, SECOND);

      expect(rewardFirst).to.eq(wei(224.6));
      expect(rewardSecond).to.eq(wei(47));
    });
    it('should correctly calculate distribution rewards with real data', async () => {
      const pool: IDistribution.PoolStruct = {
        payoutStart: oneDay,
        decreaseInterval: oneDay,
        withdrawLockPeriod: 1,
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
        minimalStake: wei(0.1),
        isPublic: true,
      };
      await distribution.createPool(pool);

      await distribution.stake(1, wei(1));

      await setTime(oneDay + oneDay);
      let reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.eq(wei(14400));

      await setTime(oneDay + oneDay * 2);
      reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.eq(wei(28797.531005299));

      await setTime(oneDay + oneDay * 13);
      reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.eq(wei(187007.418413322));

      await setTime(oneDay + oneDay * 201);
      reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.eq(wei(2844773.2065099));

      await setTime(oneDay + oneDay * 5830);
      reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.closeTo(wei(41999990.123144), wei(0.000001));

      await setTime(oneDay + oneDay * 5833);
      const lastDayReward = await distribution.getCurrentUserReward(1, OWNER);
      expect(lastDayReward).to.closeTo(wei(41999999.9988394), wei(0.000001));

      await setTime(oneDay + oneDay * 5834);
      reward = await distribution.getCurrentUserReward(1, OWNER);
      expect(reward).to.eq(lastDayReward);
    });
  });
  it("should return 0 if pool isn't found", async () => {
    const reward = await distribution.getCurrentUserReward(3, OWNER);

    expect(reward).to.eq(0);
  });
});

export const _getDefaultPool = (): IDistribution.PoolStruct => {
  return {
    payoutStart: oneDay,
    decreaseInterval: oneDay,
    withdrawLockPeriod: 12 * oneHour,
    initialReward: wei(100),
    rewardDecrease: wei(2),
    minimalStake: wei(0.1),
    isPublic: true,
  };
};

const _comparePoolStructs = (a: IDistribution.PoolStruct, b: IDistribution.PoolStruct): boolean => {
  return (
    a.payoutStart.toString() === b.payoutStart.toString() &&
    a.decreaseInterval.toString() === b.decreaseInterval.toString() &&
    a.withdrawLockPeriod.toString() === b.withdrawLockPeriod.toString() &&
    a.initialReward.toString() === b.initialReward.toString() &&
    a.rewardDecrease.toString() === b.rewardDecrease.toString() &&
    a.minimalStake.toString() === b.minimalStake.toString() &&
    a.isPublic === b.isPublic
  );
};

// npx hardhat test "test/Distribution.test.ts"
// npx hardhat coverage --testfiles "test/Payment.test.js"

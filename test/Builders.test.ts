import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { getCurrentBlockTime, setNextTime, setTime } from './helpers/block-helper';
import { getDefaultBuilderPool, oneDay } from './helpers/builders-helper';
import { Reverter } from './helpers/reverter';

import { Builders, FeeConfig, IBuilders, MOROFT } from '@/generated-types/ethers';
import { PRECISION, ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('Builders', () => {
  const reverter = new Reverter();

  const chainId = 101;
  const baseFee = wei(0.01, 25); // 1%
  const baseFeeForOperation = wei(0.02, 25); // 2%

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let DELEGATE: SignerWithAddress;
  let LZ_ENDPOINT_OWNER: SignerWithAddress;

  let builders: Builders;

  let feeConfig: FeeConfig;
  let depositToken: MOROFT;

  before(async () => {
    [OWNER, SECOND, TREASURY, MINTER, DELEGATE, LZ_ENDPOINT_OWNER] = await ethers.getSigners();

    const [Builders, Mor, FeeConfig, LZEndpointMock, ERC1967Proxy] = await Promise.all([
      ethers.getContractFactory('Builders'),
      ethers.getContractFactory('MOROFT'),
      ethers.getContractFactory('FeeConfig'),
      ethers.getContractFactory('LayerZeroEndpointV2Mock'),
      ethers.getContractFactory('ERC1967Proxy'),
    ]);

    const [buildersImpl, feeConfigImpl, lZEndpointMock] = await Promise.all([
      Builders.deploy(),
      FeeConfig.deploy(),
      LZEndpointMock.deploy(chainId, LZ_ENDPOINT_OWNER),
    ]);
    depositToken = await Mor.deploy(lZEndpointMock, DELEGATE, MINTER);

    const [buildersProxy, feeConfigProxy] = await Promise.all([
      ERC1967Proxy.deploy(buildersImpl, '0x'),
      ERC1967Proxy.deploy(feeConfigImpl, '0x'),
    ]);
    feeConfig = FeeConfig.attach(feeConfigProxy) as FeeConfig;
    await feeConfig.FeeConfig_init(TREASURY, baseFee, baseFeeForOperation);
    builders = Builders.attach(buildersProxy) as Builders;
    await builders.Builders_init(depositToken, feeConfig);

    await depositToken.connect(MINTER).mint(OWNER, wei(1000));
    await depositToken.connect(MINTER).mint(SECOND, wei(1000));
    await depositToken.approve(builders, wei(1000));
    await depositToken.connect(SECOND).approve(builders, wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        const Builders = await ethers.getContractFactory('Builders');
        const builders = await Builders.deploy();

        await expect(builders.Builders_init(depositToken, feeConfig)).to.be.revertedWith(reason);
      });
    });

    describe('#Builders_init', () => {
      it('should set correct data after creation', async () => {
        const depositToken_ = await builders.depositToken();
        expect(depositToken_).to.eq(await depositToken.getAddress());

        const feeConfig_ = await builders.feeConfig();
        expect(feeConfig_).to.eq(await feeConfig.getAddress());
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(builders.Builders_init(depositToken, feeConfig)).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const BuildersV2Mock = await ethers.getContractFactory('BuildersV2');
        const buildersV2Mock = await BuildersV2Mock.deploy();

        await builders.upgradeTo(buildersV2Mock);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(builders.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
      it('should revert if `isNotUpgradeable == true`', async () => {
        await builders.removeUpgradeability();

        await expect(builders.upgradeTo(ZERO_ADDR)).to.be.revertedWith("BU: upgrade isn't available");
      });
    });
  });

  describe('#setFeeConfig', () => {
    it('should set fee config', async () => {
      await builders.setFeeConfig(feeConfig);

      expect(await builders.feeConfig()).to.equal(await feeConfig.getAddress());
    });
    it('should revert if provided fee config is zero address', async () => {
      await expect(builders.setFeeConfig(ZERO_ADDR)).to.be.revertedWith('BU: invalid fee config');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(SECOND).setFeeConfig(feeConfig)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#createBuilderPool', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    const poolId = 0;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
    });

    it('should create builder pool', async () => {
      await builders.connect(SECOND).createBuilderPool(builderPool);

      const pool_ = await builders.builders(poolId);
      expect(pool_.project).to.equal(builderPool.project);
      expect(pool_.admin).to.equal(builderPool.admin);
      expect(pool_.poolStart).to.equal(builderPool.poolStart);
      expect(pool_.withdrawLockPeriodAfterStake).to.equal(builderPool.withdrawLockPeriodAfterStake);
      expect(pool_.minimalStake).to.equal(builderPool.minimalStake);
    });
    it('should revert if pool start is less than current block timestamp', async () => {
      const pool = { ...builderPool, poolStart: 0 };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid pool start value');
    });
    it('should revert if project address is zero', async () => {
      const pool = { ...builderPool, project: ZERO_ADDR };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid project address');
    });
    it('should revert if admin address is zero', async () => {
      const pool = { ...builderPool, admin: ZERO_ADDR };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid admin address');
    });
  });

  describe('#editBuilderPool', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    const poolId = 0;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
    });

    it('should edit builder pool', async () => {
      const newPool = {
        ...builderPool,
        poolStart: Number(builderPool.poolStart) + 1,
        minimalStake: 1,
        withdrawLockPeriodAfterStake: 2,
      };
      await builders.editBuilderPool(poolId, newPool);

      const pool_ = await builders.builders(poolId);
      expect(pool_.poolStart).to.equal(newPool.poolStart);
      expect(pool_.withdrawLockPeriodAfterStake).to.equal(newPool.withdrawLockPeriodAfterStake);
      expect(pool_.minimalStake).to.equal(newPool.minimalStake);
    });
    it('should revert if pool does not exist', async () => {
      await expect(builders.editBuilderPool(1, builderPool)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it('should revert if called by non-admin', async () => {
      await expect(builders.connect(SECOND).editBuilderPool(poolId, builderPool)).to.be.revertedWith(
        'BU: only admin can edit pool',
      );
    });
    it('should revert if project address is changed', async () => {
      const newPool = { ...builderPool, project: SECOND };
      await expect(builders.editBuilderPool(poolId, newPool)).to.be.revertedWith('BU: invalid project address');
    });
    it('should revert if admin address is changed', async () => {
      const newPool = { ...builderPool, admin: SECOND };
      await expect(builders.editBuilderPool(poolId, newPool)).to.be.revertedWith('BU: invalid admin address');
    });
    it('should revert if cuurent pool start is less than current block timestamp', async () => {
      await setNextTime(100000000);
      await expect(builders.editBuilderPool(poolId, builderPool)).to.be.revertedWith('BU: invalid pool start value');
    });
    it('should revert if new pool start is less than current pool start', async () => {
      const newPool = { ...builderPool, poolStart: Number(builderPool.poolStart) - 1 };
      await expect(builders.editBuilderPool(poolId, newPool)).to.be.revertedWith('BU: invalid pool start value');
    });
  });

  describe('#removeUpgradeability', () => {
    it('should revert if caller is not owner', async () => {
      await expect(builders.connect(SECOND).removeUpgradeability()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should remove upgradeability', async () => {
      let isNotUpgradeable = await builders.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.false;

      await builders.removeUpgradeability();

      isNotUpgradeable = await builders.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.true;
    });
  });

  describe('#getAdminProjects', () => {
    let builderPool: IBuilders.BuilderPoolStruct;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
    });

    it('should return correct projects', async () => {
      let projects = await builders.getAdminProjects(OWNER);
      expect(projects).to.deep.equal([]);

      projects = await builders.getAdminProjects(SECOND);
      expect(projects).to.deep.equal([]);

      await builders.createBuilderPool(builderPool);
      projects = await builders.getAdminProjects(OWNER);
      expect(projects).to.deep.equal([0]);

      await builders.connect(SECOND).createBuilderPool(builderPool);
      projects = await builders.getAdminProjects(OWNER);
      expect(projects).to.deep.equal([0, 1]);

      await builders.createBuilderPool({ ...builderPool, admin: SECOND });
      projects = await builders.getAdminProjects(SECOND);
      expect(projects).to.deep.equal([2]);

      await builders.createBuilderPool(builderPool);
      projects = await builders.getAdminProjects(OWNER);
      expect(projects).to.deep.equal([0, 1, 3]);
    });
  });

  describe('#getWithdrawLockPeriodMultiplier', () => {
    const poolId = 0;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      await builders.createBuilderPool(getDefaultBuilderPool(OWNER));

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate multiplier correctly', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(multiplier).to.be.closeTo(wei(7.234393096, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(poolId, 0, periodStart + 200 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.171513456, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if end > periodEnd_', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(poolId, 24000 * oneDay, 99999999 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.176529228, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_ and end > periodEnd_', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(poolId, 0, 99999999 * oneDay);

      expect(multiplier).to.eq(wei(10.7, 25));
    });
    it('should return 1 if start >= end', async () => {
      let multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        periodStart + 2 * oneDay,
        periodStart + 1 * oneDay,
      );
      expect(multiplier).to.eq(wei(1, 25));

      multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        periodStart + 2 * oneDay,
        periodStart + 2 * oneDay,
      );
      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier >= 1', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        periodStart + 1 * oneDay,
        periodStart + 1 * oneDay + 1,
      );

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier <= 10.7', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        periodStart + 10 * oneDay,
        99999999 * oneDay,
      );

      expect(multiplier).to.eq(wei(10.7, 25));
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(1, 0, 1);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#getCurrentUserMultiplier', () => {
    const poolId = 0;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      await builders.createBuilderPool(getDefaultBuilderPool(OWNER));

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate multiplier correctly', async () => {
      await setNextTime(payoutStart + 365 * oneDay);
      await builders.stake(poolId, wei(1), payoutStart + 1742 * oneDay);
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(
        poolId,
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(await builders.getCurrentUserMultiplier(poolId, OWNER)).to.equal(multiplier);
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await builders.getCurrentUserMultiplier(1, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return 1 if user is not staked', async () => {
      const multiplier = await builders.getCurrentUserMultiplier(poolId, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#getNewRewardFromLastUpdate', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    const poolId = 0;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);

      await setTime(Number(builderPool.poolStart));
    });

    it('should return correct reward', async () => {
      let reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(0);
      expect(await depositToken.balanceOf(builders)).to.eq(0);

      await depositToken.connect(MINTER).mint(builders, wei(1000));
      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(1000));
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1000));

      await builders.stake(poolId, wei(1), 0);
      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(0));
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1001));

      await depositToken.connect(MINTER).mint(builders, wei(1000));
      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(1000));

      await setTime((await getCurrentBlockTime()) + Number(builderPool.withdrawLockPeriodAfterStake));

      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(1000));

      await builders.withdraw(poolId, wei(1));
      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(0));
      expect(await depositToken.balanceOf(builders)).to.eq(wei(2000));

      await builders.claim(poolId, OWNER);
      reward = await builders.getNewRewardFromLastUpdate();
      expect(reward).to.eq(wei(0));
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1000));
    });
  });

  describe('#stake', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    const poolId = 0;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
    });

    it('should stake correctly', async () => {
      // A stakes 1 token
      await setNextTime(oneDay * 1);
      await builders.stake(poolId, wei(1), 0);

      let userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(1));
      let builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(1));
      expect(builderData.rate).to.eq(0);
      expect(builderData.pendingRewards).to.eq(0);
      expect(userData.withdrawLockStart).to.eq(oneDay);
      expect(userData.withdrawLockEnd).to.eq(await getCurrentBlockTime());
      let poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(0);
      expect(poolData.totalVirtualDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await builders.totalDeposited()).to.eq(wei(1));

      // A stakes 2 tokens
      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay * 2);
      await builders.stake(poolId, wei(3), 0);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(4));
      expect(builderData.rate).to.eq(wei(100, 25));
      expect(builderData.pendingRewards).to.eq(wei(100));
      expect(userData.withdrawLockStart).to.eq(oneDay * 2);
      expect(userData.withdrawLockEnd).to.eq(await getCurrentBlockTime());
      poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(wei(100));
      expect(poolData.totalVirtualDeposited).to.eq(wei(4));
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await builders.totalDeposited()).to.eq(wei(4));

      // B stakes 8 tokens
      await depositToken.connect(MINTER).mint(builders, wei(98));
      await setNextTime(oneDay * 3);
      await builders.connect(SECOND).stake(poolId, wei(8), 0);
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(8));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(12));
      expect(builderData.rate).to.eq(wei(124.5, 25));
      expect(builderData.pendingRewards).to.eq(wei(198));
      expect(userData.withdrawLockStart).to.eq(oneDay * 3);
      expect(userData.withdrawLockEnd).to.eq(await getCurrentBlockTime());
      poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(wei(198));
      expect(poolData.totalVirtualDeposited).to.eq(wei(12));
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await builders.totalDeposited()).to.eq(wei(12));
    });
    it('should stake with lock correctly', async () => {
      const withdrawLockEnd = oneDay * 9999999;
      const multiplier = await builders.getWithdrawLockPeriodMultiplier(poolId, 0, withdrawLockEnd);
      // A stakes 1 token
      await setNextTime(oneDay * 1);
      await builders.stake(poolId, wei(1), withdrawLockEnd);

      let userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(1));
      let builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
      expect(builderData.rate).to.eq(0);
      expect(builderData.pendingRewards).to.eq(0);
      expect(userData.withdrawLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd);
      let poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(0);
      expect(poolData.totalVirtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
      expect(poolData.rate).to.eq(0);
      expect(await builders.totalDeposited()).to.eq(wei(1));

      // A stakes 2 tokens
      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay * 2);
      await builders.stake(poolId, wei(3), withdrawLockEnd);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
      expect(builderData.pendingRewards).to.closeTo(wei(100), wei(0.000001));
      expect(userData.withdrawLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd);
      poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(wei(100));
      expect(poolData.totalVirtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
      expect(await builders.totalDeposited()).to.eq(wei(4));

      // B stakes 8 tokens
      await depositToken.connect(MINTER).mint(builders, wei(98));
      await setNextTime(oneDay * 3);
      await builders.connect(SECOND).stake(poolId, wei(8), withdrawLockEnd);
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(8));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq((wei(12) * multiplier) / PRECISION);
      expect(builderData.pendingRewards).to.closeTo(wei(198), wei(0.000001));
      expect(userData.withdrawLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd);
      poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(wei(198));
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * multiplier) / PRECISION + (wei(8) * multiplier) / PRECISION,
      );
      expect(await builders.totalDeposited()).to.eq(wei(12));
    });
    it('should correctly handle zero as lock end value', async () => {
      const withdrawLockEnd = oneDay * 9999999;
      // A stakes 1 token
      await setNextTime(oneDay * 1);
      await builders.stake(poolId, wei(1), withdrawLockEnd);

      const multiplier = await builders.getCurrentUserMultiplier(poolId, OWNER);

      await setNextTime(oneDay * 2);
      await builders.stake(poolId, wei(1), 0);

      expect(await builders.getCurrentUserMultiplier(poolId, OWNER)).to.eq(multiplier);

      const userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(2));
      const builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);
      expect(builderData.rate).to.eq(0);
      expect(builderData.pendingRewards).to.eq(0);
      expect(userData.withdrawLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(builders.stake(1, wei(1), 0)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it('should revert if amount is less than minimal stake', async () => {
      await setNextTime(oneDay);

      await expect(builders.stake(poolId, 1, 0)).to.be.revertedWith('BU: amount too low');
    });
    it('should revert if amount is equal zero', async () => {
      await setNextTime(oneDay);

      await expect(builders.stake(poolId, 0, 0)).to.be.revertedWith('BU: nothing to stake');
    });
    it('should revert if withdrawLockEnd is less than previous one', async () => {
      await setNextTime(oneDay);

      await builders.stake(poolId, wei(1), 2 * oneDay);

      await expect(builders.stake(poolId, wei(1), oneDay)).to.be.revertedWith('BU: invalid withdraw lock end');
    });
    it('should revert if current block timestamp is less than pool start', async () => {
      await expect(builders.stake(poolId, wei(1), 0)).to.be.revertedWith("BU: pool isn't started");
    });
  });

  describe('#getCurrentBuilderReward', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    const poolId = 0;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
    });

    it('should return correct reward', async () => {
      await setNextTime(oneDay * 1);
      await builders.stake(poolId, wei(1), 0);

      let reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(0);

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay * 2);
      await builders.stake(poolId, wei(3), 0);

      reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(wei(100));

      await depositToken.connect(MINTER).mint(builders, wei(98));
      await setNextTime(oneDay * 3);
      await builders.connect(SECOND).stake(poolId, wei(8), 0);

      reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(wei(198));
    });
    it('should return 0 if pool is not exist', async () => {
      const reward = await builders.getCurrentBuilderReward(1);

      expect(reward).to.eq(0);
    });
    it('should return 0 if users are not staked', async () => {
      await setTime(100000);

      const reward = await builders.getCurrentBuilderReward(poolId);

      expect(reward).to.eq(0);
    });
  });

  describe('#claim', () => {
    const poolId = 0;

    beforeEach(async () => {
      await builders.createBuilderPool(getDefaultBuilderPool(OWNER));
    });

    it('should correctly claim, one user, without redeposits', async () => {
      let userData, builderData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      // Claim after 2 days
      await depositToken.connect(MINTER).mint(builders, wei(198));
      await setNextTime(oneDay + oneDay * 2);
      let tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(198) * baseFeeForOperation) / PRECISION],
      );
      expect(await builders.totalDistributed()).to.eq(wei(198));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(1));
      expect(builderData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await depositToken.connect(MINTER).mint(builders, wei(96));
      await setNextTime(oneDay + oneDay * 3);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(96) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(96) * baseFeeForOperation) / PRECISION],
      );

      expect(await builders.totalDistributed()).to.eq(wei(198 + 96));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(1));
      expect(builderData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await depositToken.connect(MINTER).mint(builders, wei(276));
      await setNextTime(oneDay + oneDay * 6);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(276) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(276) * baseFeeForOperation) / PRECISION],
      );

      expect(await builders.totalDistributed()).to.eq(wei(198 + 96 + 276));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(1));
      expect(builderData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with redeposits', async () => {
      let userData, builderData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      // Deposit 1 day after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay + oneDay);
      let tx = await builders.connect(SECOND).stake(poolId, wei(1), 0);
      await expect(tx).to.changeTokenBalances(depositToken, [SECOND, TREASURY], [-wei(1), 0]);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(2));
      expect(builderData.pendingRewards).to.eq(wei(100));

      // Claim after 1.5 days
      await depositToken.connect(MINTER).mint(builders, wei(49));
      await setNextTime(oneDay + oneDay * 1.5);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(149) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(149) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(2));
      expect(builderData.pendingRewards).to.eq(0);

      // Deposit 4 days after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(331));
      await setNextTime(oneDay + oneDay * 4);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(3));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(3));
      expect(builderData.pendingRewards).to.eq(wei(331));

      // Claim after 5.25 days
      await depositToken.connect(MINTER).mint(builders, wei(117));
      await setNextTime(oneDay + oneDay * 5.25);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(448) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(448) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(3));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(3));
      expect(builderData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      await setNextTime(oneDay + oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      // Claim after 2 days
      await depositToken.connect(MINTER).mint(builders, wei(198));
      await setNextTime(oneDay + oneDay * 2);
      const tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(198) * baseFeeForOperation) / PRECISION],
      );

      const userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      const builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(1));
      expect(builderData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData, builderData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay + oneDay);
      await builders.stake(poolId, wei(3), 0);

      // Deposit 1.5 days after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(49));
      await setNextTime(oneDay + oneDay * 1.5);
      const tx = await builders.connect(SECOND).stake(poolId, wei(2), 0);
      await expect(tx).to.changeTokenBalances(depositToken, [SECOND, TREASURY], [-wei(2), 0]);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(3));
      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(6));
      expect(builderData.pendingRewards).to.eq(wei(149));

      // Claim after 2 days after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(49));
      await setNextTime(oneDay + oneDay * 2);
      let secondBalanceBefore = await depositToken.balanceOf(SECOND);
      let treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(198) * baseFeeForOperation) / PRECISION,
        wei(0.00001),
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(3));

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(3));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(6));
      expect(builderData.pendingRewards).to.eq(0);

      // Deposit 5 days after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(282));
      await setNextTime(oneDay + oneDay * 5);
      await builders.stake(poolId, wei(4), 0);

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(7));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(10));
      expect(builderData.pendingRewards).to.eq(wei(282));

      // Claim after 7 days after the start of reward payment
      await depositToken.connect(MINTER).mint(builders, wei(178));
      await setNextTime(oneDay + oneDay * 7);
      secondBalanceBefore = await depositToken.balanceOf(SECOND);
      treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(460) * (PRECISION - baseFeeForOperation)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(460) * baseFeeForOperation) / PRECISION,
        wei(0.00001),
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(7));

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(3));

      builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.eq(wei(10));
      expect(builderData.pendingRewards).to.eq(0);
    });
    it('should correctly claim for receiver', async () => {
      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      await depositToken.connect(MINTER).mint(builders, wei(198));
      await setNextTime(oneDay + oneDay * 2);
      const tx = await builders.claim(poolId, OWNER);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, TREASURY],
        [(wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(198) * baseFeeForOperation) / PRECISION],
      );

      const userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      const builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);
    });

    describe('with multiplier', () => {
      const poolId = 0;
      const payoutStart = 1707393600;
      const periodStart = 1721908800;
      const withdrawLockEnd = periodStart + 300 * oneDay - 1;

      beforeEach(async () => {
        await setTime(payoutStart - 3 * oneDay);
      });

      it('should correctly claim, one user, without redeposits', async () => {
        await builders.connect(SECOND).stake(poolId, wei(1), 0);

        await depositToken.connect(MINTER).mint(builders, wei(50));
        await setNextTime(periodStart + oneDay / 2);
        await builders.connect(SECOND).lockWithdraw(poolId, withdrawLockEnd);

        const multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));

        await setTime(withdrawLockEnd);
        const secondBalanceBefore = await depositToken.balanceOf(SECOND);
        const treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
        await builders.claim(poolId, SECOND);
        expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
          (wei(50) * (PRECISION - baseFeeForOperation)) / PRECISION,
          wei(0.00001),
        );
        expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
          (wei(50) * baseFeeForOperation) / PRECISION,
          wei(0.00001),
        );

        const userData = await builders.usersData(SECOND, poolId);
        expect(userData.deposited).to.eq(wei(1));
        const builderData = await builders.buildersData(poolId);
        expect(builderData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(builderData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, with redeposits', async () => {
        let userData, builderData;

        await builders.connect(SECOND).stake(poolId, wei(1), 0);

        await builders.connect(SECOND).lockWithdraw(poolId, withdrawLockEnd);

        await setNextTime(periodStart + oneDay);
        await depositToken.connect(MINTER).mint(builders, wei(100));
        await builders.connect(SECOND).stake(poolId, wei(1), withdrawLockEnd);

        let multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));
        userData = await builders.usersData(SECOND, poolId);
        expect(userData.deposited).to.eq(wei(2));
        builderData = await builders.buildersData(poolId);
        expect(builderData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);

        await setTime(withdrawLockEnd);
        await depositToken.connect(MINTER).mint(builders, wei(100000000));
        const secondBalanceBefore = await depositToken.balanceOf(SECOND);
        const treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
        await builders.claim(poolId, SECOND);
        expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
          (wei(100000100) * (PRECISION - baseFeeForOperation)) / PRECISION,
          wei(0.00001),
        );
        expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
          (wei(100000100) * baseFeeForOperation) / PRECISION,
          wei(0.00001),
        );

        multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
        userData = await builders.usersData(SECOND, poolId);
        expect(userData.deposited).to.eq(wei(2));
        builderData = await builders.buildersData(poolId);
        expect(builderData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);
        expect(builderData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, join after start', async () => {
        await setNextTime(periodStart + oneDay);
        await builders.connect(SECOND).stake(poolId, wei(1), 0);
        await depositToken.connect(MINTER).mint(builders, wei(100));

        await builders.connect(SECOND).lockWithdraw(poolId, withdrawLockEnd);

        await setTime(withdrawLockEnd);
        await depositToken.connect(MINTER).mint(builders, wei(100000000));
        const secondBalanceBefore = await depositToken.balanceOf(SECOND);
        const treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
        await builders.claim(poolId, SECOND);
        expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
          (wei(100000100) * (PRECISION - baseFeeForOperation)) / PRECISION,
          wei(0.00001),
        );
        expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
          (wei(100000100) * baseFeeForOperation) / PRECISION,
          wei(0.00001),
        );

        const userData = await builders.usersData(SECOND, poolId);
        expect(userData.deposited).to.eq(wei(1));
        const builderData = await builders.buildersData(poolId);
        expect(builderData.virtualDeposited).to.eq(
          (wei(1) * (await builders.getCurrentUserMultiplier(poolId, SECOND))) / PRECISION,
        );
        expect(builderData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, few users, without redeposits', async () => {
        let userData;

        await builders.connect(SECOND).stake(poolId, wei(1), 0);
        await builders.connect(SECOND).lockWithdraw(poolId, withdrawLockEnd);

        await setNextTime(periodStart);
        await depositToken.connect(MINTER).mint(builders, wei(100));
        await builders.stake(poolId, wei(3), 0);
        await builders.lockWithdraw(poolId, withdrawLockEnd);

        await depositToken.connect(MINTER).mint(builders, wei(100000000));
        await setTime(withdrawLockEnd);
        const secondBalanceBefore = await depositToken.balanceOf(SECOND);
        const treasuryBalanceBefore = await depositToken.balanceOf(TREASURY);
        await builders.claim(poolId, SECOND);
        expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
          (wei(100000100) * (PRECISION - baseFeeForOperation)) / PRECISION,
          wei(0.00001),
        );
        expect((await depositToken.balanceOf(TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
          (wei(100000100) * baseFeeForOperation) / PRECISION,
          wei(0.00001),
        );

        userData = await builders.usersData(OWNER, poolId);
        expect(userData.deposited).to.eq(wei(3));

        userData = await builders.usersData(SECOND, poolId);
        expect(userData.deposited).to.eq(wei(1));

        const builderData = await builders.buildersData(poolId);
        expect(builderData.virtualDeposited).to.closeTo(
          (wei(4) * (await builders.getCurrentUserMultiplier(poolId, SECOND))) / PRECISION,
          wei(0.00001),
        );
        expect(builderData.pendingRewards).to.eq(0);
      });
    });
    it('should not pay fee, if percent is zero', async () => {
      await feeConfig.setBaseFee(0, 0);

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);
      await depositToken.connect(MINTER).mint(builders, wei(198));

      await setNextTime(oneDay + oneDay * 2);
      const tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(depositToken, [SECOND, TREASURY], [wei(198), 0]);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(builders.connect(SECOND).claim(1, SECOND)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it('should revert if nothing to claim', async () => {
      await expect(builders.claim(poolId, SECOND)).to.be.revertedWith('BU: nothing to claim');
    });
    it('should revert if caller is not-admin of the pool', async () => {
      await expect(builders.connect(SECOND).claim(poolId, SECOND)).to.be.revertedWith(
        'BU: only admin can claim rewards',
      );
    });
  });

  describe('#withdraw', () => {
    const poolId = 0;

    beforeEach(async () => {
      await builders.createBuilderPool({ ...getDefaultBuilderPool(OWNER), withdrawLockPeriodAfterStake: oneDay - 1 });
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      let userData, builderData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(1), 0);

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay + oneDay);
      await builders.stake(poolId, wei(3), 0);

      // Withdraw after 2 days
      await depositToken.connect(MINTER).mint(builders, wei(98));
      await setNextTime(oneDay + oneDay * 2);
      let tx = await builders.withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, TREASURY],
        [(wei(3) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(3) * baseFeeForOperation) / PRECISION],
      );

      tx = await builders.claim(poolId, OWNER);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, TREASURY],
        [(wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(198) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);
      expect(await builders.totalDeposited()).to.eq(wei(1));

      // Claim after 3 days
      await depositToken.connect(MINTER).mint(builders, wei(96));
      await setNextTime(oneDay + oneDay * 3);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(96) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(96) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await depositToken.connect(MINTER).mint(builders, wei(94));
      await setNextTime(oneDay + oneDay * 4);
      tx = await builders.connect(SECOND).withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(1) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(1) * baseFeeForOperation) / PRECISION],
      );

      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(94) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(94) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);
      expect(await builders.totalDeposited()).to.eq(wei(0));

      await expect(builders.claim(poolId, OWNER)).to.be.revertedWith('BU: nothing to claim');
      await expect(builders.claim(poolId, SECOND)).to.be.revertedWith('BU: nothing to claim');
    });
    it('should correctly withdraw, few users, withdraw part', async () => {
      let userData, builderData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).stake(poolId, wei(4), 0);

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay + oneDay);
      await builders.stake(poolId, wei(6), 0);

      // Withdraw after 2 days
      await depositToken.connect(MINTER).mint(builders, wei(98));
      await setNextTime(oneDay + oneDay * 2);
      let tx = await builders.withdraw(poolId, wei(2));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, TREASURY],
        [(wei(2) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(2) * baseFeeForOperation) / PRECISION],
      );

      tx = await builders.claim(poolId, OWNER);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, TREASURY],
        [(wei(198) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(198) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await depositToken.connect(MINTER).mint(builders, wei(96));
      await setNextTime(oneDay + oneDay * 3);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(96) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(96) * baseFeeForOperation) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);

      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await depositToken.connect(MINTER).mint(builders, wei(94));
      await setNextTime(oneDay + oneDay * 4);
      tx = await builders.connect(SECOND).withdraw(poolId, wei(2));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(2) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(2) * baseFeeForOperation) / PRECISION],
      );

      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, TREASURY],
        [(wei(94) * (PRECISION - baseFeeForOperation)) / PRECISION, (wei(94) * baseFeeForOperation) / PRECISION],
      );
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      // Claim after 5 days
      await depositToken.connect(MINTER).mint(builders, wei(92));
      await setNextTime(oneDay + oneDay * 5);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalance(
        depositToken,
        SECOND,
        (wei(92) * (PRECISION - baseFeeForOperation)) / PRECISION,
      );
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderData = await builders.buildersData(poolId);
      expect(builderData.pendingRewards).to.eq(0);
    });
    it('should not pay fee, if percent is zero', async () => {
      await feeConfig.setBaseFee(0, 0);

      await setNextTime(oneDay);
      await builders.stake(poolId, wei(1), 0);

      await setNextTime(oneDay * 3);

      const tx = await builders.withdraw(poolId, wei(1));
      await expect(tx).to.changeTokenBalances(depositToken, [OWNER, TREASURY], [wei(1), 0]);
    });
    it('should revert if trying to withdraw zero', async () => {
      await expect(builders.withdraw(poolId, 0)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if user didn't stake", async () => {
      await expect(builders.withdraw(poolId, 1)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if pool isn't found", async () => {
      await expect(builders.withdraw(111, 1)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it("should revert if `minimalStake` didn't pass", async () => {
      await setNextTime(oneDay);

      await builders.stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay * 2);

      await expect(builders.withdraw(poolId, wei(0.99))).to.be.revertedWith('BU: invalid withdraw amount');
    });
    it("should revert if `withdrawLockPeriodAfterStake` didn't pass", async () => {
      await setNextTime(oneDay * 10);

      await builders.stake(poolId, wei(1), 0);

      await expect(builders.withdraw(poolId, wei(0.1))).to.be.revertedWith('BU: pool withdraw is locked');
    });
    it('should revert if personal withdraw is locked', async () => {
      await setNextTime(oneDay);

      await builders.stake(poolId, wei(1), 0);
      await builders.lockWithdraw(poolId, oneDay * 10);

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(oneDay + oneDay * 2);

      await expect(builders.withdraw(poolId, wei(1))).to.be.revertedWith('BU: user withdraw is locked');
    });
  });

  describe('#lockWithdraw', () => {
    const poolId = 0;
    const periodStart = 1721908800;
    const withdrawLockEnd = periodStart + 300 * oneDay;

    beforeEach(async () => {
      await builders.createBuilderPool(getDefaultBuilderPool(OWNER));

      await setTime(periodStart - 3 * oneDay);
    });

    it('should lock withdraw correctly', async () => {
      await builders.stake(poolId, wei(10), 0);

      const initialTime = await getCurrentBlockTime();

      let userData = await builders.usersData(OWNER, poolId);
      expect(userData.withdrawLockStart).to.eq(initialTime);
      expect(userData.withdrawLockEnd).to.eq(await getCurrentBlockTime());

      await depositToken.connect(MINTER).mint(builders, wei(100));
      await setNextTime(periodStart + oneDay);

      await builders.lockWithdraw(poolId, withdrawLockEnd);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(10));
      const builderData = await builders.buildersData(poolId);
      expect(builderData.virtualDeposited).to.gt(wei(10));
      expect(builderData.rate).to.gt(0);
      expect(builderData.pendingRewards).to.gt(0);
      expect(userData.withdrawLockStart).to.eq(initialTime);
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd);

      const poolData = await builders.poolData();
      expect(poolData.rewardsAtLastUpdate).to.eq(wei(100)); //todo
      expect(poolData.totalVirtualDeposited).to.gt(wei(1));
      expect(poolData.rate).to.gt(0);
      expect(await builders.totalDeposited()).to.eq(wei(10));

      await depositToken.connect(MINTER).mint(builders, wei(10000000));
      await setTime(withdrawLockEnd);

      await builders.lockWithdraw(poolId, withdrawLockEnd * 2);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.withdrawLockStart).to.eq(initialTime);
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd * 2);

      await depositToken.connect(MINTER).mint(builders, wei(100000));
      await setTime(withdrawLockEnd * 2);
      await builders.claim(poolId, OWNER);

      await builders.lockWithdraw(poolId, withdrawLockEnd * 3);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.withdrawLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.withdrawLockEnd).to.eq(withdrawLockEnd * 3);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(builders.lockWithdraw(1, 1)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it('should revert if withdrawLockEnd < block.timestamp', async () => {
      await builders.stake(poolId, wei(10), 0);

      await setNextTime(periodStart + oneDay);

      await expect(builders.lockWithdraw(poolId, periodStart - 1)).to.be.revertedWith('BU: invalid lock end value (1)');
    });
    it('should revert if withdrawLockEnd less then previous lock end', async () => {
      await builders.stake(poolId, wei(10), withdrawLockEnd);

      await expect(builders.lockWithdraw(poolId, withdrawLockEnd - 1)).to.be.revertedWith(
        'BU: invalid lock end value (2)',
      );
    });
    it('should revert if user is not staked', async () => {
      await expect(builders.lockWithdraw(poolId, (await getCurrentBlockTime()) + 2)).to.be.revertedWith(
        "BU: user isn't staked",
      );
    });
  });
});

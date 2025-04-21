import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { encodeBytes32String } from 'ethers';
import { ethers } from 'hardhat';

import { getCurrentBlockTime, setNextTime, setTime } from '../helpers/block-helper';
import { getDefaultBuilderPool } from '../helpers/builders-helper';
import { oneDay, oneHour } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { BuildersTreasury, BuildersV2, FeeConfig, IBuilders, MOROFT } from '@/generated-types/ethers';
import { PRECISION, ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('BuildersV2', () => {
  const reverter = new Reverter();

  const chainId = 101;
  const feeForWithdraw = wei(0.01, 25); // 1%
  const feeForClaim = wei(0.02, 25); // 2%
  const withdrawOperation = encodeBytes32String('withdraw');
  const claimOperation = encodeBytes32String('claim');

  const editPoolDeadline = oneHour;
  const minimalWithdrawLockPeriod = oneHour * 0.5;

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let DELEGATE: SignerWithAddress;
  let LZ_ENDPOINT_OWNER: SignerWithAddress;

  let builders: BuildersV2;

  let buildersTreasury: BuildersTreasury;
  let feeConfig: FeeConfig;
  let depositToken: MOROFT;

  before(async () => {
    [OWNER, SECOND, FEE_TREASURY, MINTER, DELEGATE, LZ_ENDPOINT_OWNER] = await ethers.getSigners();

    const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
    const [lib2] = await Promise.all([await lib2Factory.deploy()]);

    const [Builders, Mor, FeeConfig, BuildersTreasury, LZEndpointMock, ERC1967Proxy] = await Promise.all([
      ethers.getContractFactory('BuildersV2', {
        libraries: {
          LockMultiplierMath: await lib2.getAddress(),
        },
      }),
      ethers.getContractFactory('MOROFT'),
      ethers.getContractFactory('FeeConfig'),
      ethers.getContractFactory('BuildersTreasury'),
      ethers.getContractFactory('LayerZeroEndpointV2Mock'),
      ethers.getContractFactory('ERC1967Proxy'),
    ]);

    const [buildersImpl, feeConfigImpl, buildersTreasuryImpl, lZEndpointMock] = await Promise.all([
      Builders.deploy(),
      FeeConfig.deploy(),
      BuildersTreasury.deploy(),
      LZEndpointMock.deploy(chainId, LZ_ENDPOINT_OWNER),
    ]);
    depositToken = await Mor.deploy(lZEndpointMock, DELEGATE, MINTER);

    const [buildersProxy, feeConfigProxy, buildersTreasuryProxy] = await Promise.all([
      ERC1967Proxy.deploy(buildersImpl, '0x'),
      ERC1967Proxy.deploy(feeConfigImpl, '0x'),
      ERC1967Proxy.deploy(buildersTreasuryImpl, '0x'),
    ]);
    buildersTreasury = BuildersTreasury.attach(buildersTreasuryProxy) as BuildersTreasury;
    feeConfig = FeeConfig.attach(feeConfigProxy) as FeeConfig;
    await feeConfig.FeeConfig_init(FEE_TREASURY, 1);
    builders = Builders.attach(buildersProxy) as BuildersV2;
    await builders.BuildersV2_init(
      depositToken,
      feeConfig,
      buildersTreasury,
      editPoolDeadline,
      minimalWithdrawLockPeriod,
    );
    await buildersTreasury.BuildersTreasury_init(depositToken, builders);

    await feeConfig.setFeeForOperation(builders, withdrawOperation, feeForWithdraw);
    await feeConfig.setFeeForOperation(builders, claimOperation, feeForClaim);

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
        await expect(
          builders.BuildersV2_init(
            depositToken,
            feeConfig,
            buildersTreasury,
            editPoolDeadline,
            minimalWithdrawLockPeriod,
          ),
        ).to.be.revertedWith(reason);
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

        await expect(
          builders.BuildersV2_init(
            depositToken,
            feeConfig,
            buildersTreasury,
            editPoolDeadline,
            minimalWithdrawLockPeriod,
          ),
        ).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const BuildersV2Mock = await ethers.getContractFactory('L1Sender');
        const buildersV2Mock = await BuildersV2Mock.deploy();

        await builders.upgradeTo(buildersV2Mock);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(builders.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IBuilders', async () => {
      expect(await builders.supportsInterface('0xe4156871')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await builders.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('#setFeeConfig', () => {
    it('should set fee config', async () => {
      await builders.setFeeConfig(feeConfig);

      expect(await builders.feeConfig()).to.equal(await feeConfig.getAddress());
    });
    it('should revert if provided fee config is not IFeeConfig', async () => {
      await expect(builders.setFeeConfig(builders)).to.be.revertedWith('BU: invalid fee config');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(SECOND).setFeeConfig(feeConfig)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setBuildersTreasury', () => {
    it('should set builders treasury', async () => {
      const buildersTreasuryFactory = await ethers.getContractFactory('BuildersTreasury');
      const buildersTreasuryImpl = await buildersTreasuryFactory.deploy();

      await builders.setBuildersTreasury(buildersTreasuryImpl);

      expect(await builders.buildersTreasury()).to.equal(await buildersTreasuryImpl.getAddress());
    });
    it('should revert if provided builders treasury is not IBuildersTreasury', async () => {
      await expect(builders.setBuildersTreasury(builders)).to.be.revertedWith('BU: invalid builders treasury');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(SECOND).setBuildersTreasury(buildersTreasury)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setEditPoolDeadline', () => {
    it('should set edit pool deadline', async () => {
      await builders.setEditPoolDeadline(1);

      expect(await builders.editPoolDeadline()).to.equal(1);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(SECOND).setEditPoolDeadline(oneHour)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setMinimalWithdrawLockPeriod', () => {
    it('should set minimal withdraw lock period', async () => {
      await builders.setMinimalWithdrawLockPeriod(1);

      expect(await builders.minimalWithdrawLockPeriod()).to.equal(1);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(SECOND).setMinimalWithdrawLockPeriod(oneHour)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#createBuilderPool', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      poolId = await builders.getPoolId(builderPool.name);
    });

    it('should create builder pool', async () => {
      await builders.connect(SECOND).createBuilderPool(builderPool);

      const builderPool_ = await builders.builderPools(poolId);
      expect(builderPool_.name).to.equal(builderPool.name);
      expect(builderPool_.admin).to.equal(builderPool.admin);
      expect(builderPool_.poolStart).to.equal(builderPool.poolStart);
      expect(builderPool_.withdrawLockPeriodAfterDeposit).to.equal(builderPool.withdrawLockPeriodAfterDeposit);
      expect(builderPool_.claimLockEnd).to.equal(builderPool.claimLockEnd);
      expect(builderPool_.minimalDeposit).to.equal(builderPool.minimalDeposit);
    });
    it('should revert if pool start is less than current block timestamp', async () => {
      const pool = { ...builderPool, poolStart: 0 };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid pool start value');
    });
    it('should revert if admin address is zero', async () => {
      const pool = { ...builderPool, admin: ZERO_ADDR };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid admin address');
    });
    it('should revert if name is already taken', async () => {
      await builders.createBuilderPool(builderPool);

      await expect(builders.createBuilderPool(builderPool)).to.be.revertedWith('BU: pool already exist');
    });
    it('should revert if name is empty', async () => {
      const pool = { ...builderPool, name: '' };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid project name');
    });
    it('should revert if withdrawLockPeriodAfterDeposit is less than minimalWithdrawLockPeriod', async () => {
      const pool = { ...builderPool, withdrawLockPeriodAfterDeposit: 1 };
      await expect(builders.createBuilderPool(pool)).to.be.revertedWith('BU: invalid withdraw lock');
    });
  });

  describe('#editBuilderPool', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);
    });

    it('should edit builder pool', async () => {
      const newPool = {
        name: builderPool.name,
        admin: SECOND,
        poolStart: oneDay + 1,
        withdrawLockPeriodAfterDeposit: oneDay + 1,
        claimLockEnd: 10 * oneDay + 1,
        minimalDeposit: wei(0.1) + 1n,
      };
      await builders.editBuilderPool(newPool);

      const newBuilderPool = await builders.builderPools(poolId);
      expect(newBuilderPool.name).to.equal(newPool.name);
      expect(newBuilderPool.admin).to.equal(newPool.admin);
      expect(newBuilderPool.poolStart).to.equal(newPool.poolStart);
      expect(newBuilderPool.withdrawLockPeriodAfterDeposit).to.equal(newPool.withdrawLockPeriodAfterDeposit);
      expect(newBuilderPool.claimLockEnd).to.equal(newPool.claimLockEnd);
      expect(newBuilderPool.minimalDeposit).to.equal(newPool.minimalDeposit);
    });
    it('should revert if pool does not exist', async () => {
      await expect(builders.editBuilderPool({ ...builderPool, name: '--' })).to.be.revertedWith(
        "BU: pool doesn't exist",
      );
    });
    it('should revert if called by non-admin', async () => {
      await expect(builders.connect(SECOND).editBuilderPool(builderPool)).to.be.revertedWith(
        'BU: only admin can edit pool',
      );
    });
    it('should not revert if admin address is changed', async () => {
      const newPool = { ...builderPool, admin: SECOND };
      await expect(builders.editBuilderPool(newPool)).to.be.ok;
    });
    it('should revert if current pool start is less than current block timestamp', async () => {
      await setNextTime(100000000);
      await expect(builders.editBuilderPool(builderPool)).to.be.revertedWith('BU: invalid pool start value');
    });
    it('should revert if new pool start is less than current pool start', async () => {
      const newPool = { ...builderPool, poolStart: Number(builderPool.poolStart) - 1 };
      await expect(builders.editBuilderPool(newPool)).to.be.revertedWith('BU: invalid pool start value');
    });
    it('should revert if edit deadline is expired', async () => {
      await setTime(Number(builderPool.poolStart) - 2);
      await expect(builders.editBuilderPool(builderPool)).to.be.revertedWith('BU: pool edit deadline is over');
    });
  });

  describe('#getLockPeriodMultiplier', () => {
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    it('should calculate multiplier correctly', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(multiplier).to.be.closeTo(wei(7.234393096, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(0, periodStart + 200 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.171513456, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if end > periodEnd_', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(24000 * oneDay, 99999999 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.176529228, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_ and end > periodEnd_', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(0, 99999999 * oneDay);

      expect(multiplier).to.eq(wei(10.7, 25));
    });
    it('should return 1 if start >= end', async () => {
      let multiplier = await builders.getLockPeriodMultiplier(periodStart + 2 * oneDay, periodStart + 1 * oneDay);
      expect(multiplier).to.eq(wei(1, 25));

      multiplier = await builders.getLockPeriodMultiplier(periodStart + 2 * oneDay, periodStart + 2 * oneDay);
      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier >= 1', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(periodStart + 1 * oneDay, periodStart + 1 * oneDay + 1);

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier <= 10.7', async () => {
      const multiplier = await builders.getLockPeriodMultiplier(periodStart + 10 * oneDay, 99999999 * oneDay);

      expect(multiplier).to.eq(wei(10.7, 25));
    });
  });

  describe('#getCurrentUserMultiplier', () => {
    let poolId: string;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: payoutStart + 1742 * oneDay };
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate multiplier correctly', async () => {
      await setNextTime(payoutStart + 365 * oneDay);
      await builders.deposit(poolId, wei(1));
      const multiplier = await builders.getLockPeriodMultiplier(
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(await builders.getCurrentUserMultiplier(poolId, OWNER)).to.equal(multiplier);
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await builders.getCurrentUserMultiplier(await builders.getPoolId('bla'), OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return 1 if user is not staked', async () => {
      const multiplier = await builders.getCurrentUserMultiplier(poolId, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#getNotDistributedRewards', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);

      await setTime(Number(builderPool.poolStart));
    });

    it('should return correct reward', async () => {
      let reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(0);
      expect(await depositToken.balanceOf(builders)).to.eq(0);

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(1000));
      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(1000));
      expect(await depositToken.balanceOf(builders)).to.eq(0);

      await builders.deposit(poolId, wei(1));
      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(1000));
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(1000));
      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(2000));

      await setTime((await getCurrentBlockTime()) + Number(builderPool.withdrawLockPeriodAfterDeposit));

      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(2000));

      await builders.withdraw(poolId, wei(1));
      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(0));
      expect(await depositToken.balanceOf(builders)).to.eq(0);

      await setTime(oneDay * 10);
      await builders.claim(poolId, OWNER);
      reward = await builders.getNotDistributedRewards();
      expect(reward).to.eq(wei(0));
      expect(await depositToken.balanceOf(builders)).to.eq(0);
    });
  });

  describe('#deposit', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;

    beforeEach(async () => {
      builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);
      poolId = await builders.getPoolId(builderPool.name);
    });

    it('should deposit with lock correctly', async () => {
      const withdrawLockEnd = oneDay * 9999999;
      const multiplier = await builders.getLockPeriodMultiplier(0, withdrawLockEnd);
      // A deposits 1 token
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));

      let userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(1));
      let builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
      expect(builderPoolData.rate).to.eq(0);
      expect(builderPoolData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.lastDeposit).to.eq(await getCurrentBlockTime());
      expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
      let totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.distributedRewards).to.eq(0);
      expect(totalPoolData.totalVirtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
      expect(totalPoolData.rate).to.eq(0);
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1));

      // A deposits 2 tokens
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));
      await setNextTime(oneDay * 2);
      await builders.deposit(poolId, wei(3));
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
      expect(builderPoolData.pendingRewards).to.closeTo(wei(100), wei(0.000001));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.lastDeposit).to.eq(await getCurrentBlockTime());
      expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.distributedRewards).to.eq(wei(100));
      expect(totalPoolData.totalVirtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
      expect(await depositToken.balanceOf(builders)).to.eq(wei(4));

      // B deposits 8 tokens
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(98));
      await setNextTime(oneDay * 3);
      await builders.connect(SECOND).deposit(poolId, wei(8));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(8));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq((wei(12) * multiplier) / PRECISION);
      expect(builderPoolData.pendingRewards).to.closeTo(wei(198), wei(0.000001));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.lastDeposit).to.eq(await getCurrentBlockTime());
      expect(userData.virtualDeposited).to.eq((wei(8) * multiplier) / PRECISION);
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.distributedRewards).to.eq(wei(198));
      expect(totalPoolData.totalVirtualDeposited).to.eq(
        (wei(4) * multiplier) / PRECISION + (wei(8) * multiplier) / PRECISION,
      );
      expect(await depositToken.balanceOf(builders)).to.eq(wei(12));
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(builders.deposit(await builders.getPoolId('bla'), wei(1))).to.be.revertedWith(
        "BU: pool doesn't exist",
      );
    });
    it('should revert if amount is less than minimal deposit', async () => {
      await setNextTime(oneDay);

      await expect(builders.deposit(poolId, 1)).to.be.revertedWith('BU: amount too low');
    });
    it('should revert if amount is equal zero', async () => {
      await setNextTime(oneDay);

      await expect(builders.deposit(poolId, 0)).to.be.revertedWith('BU: nothing to deposit');
    });
    it('should revert if current block timestamp is less than pool start', async () => {
      await expect(builders.deposit(poolId, wei(1))).to.be.revertedWith("BU: pool isn't started");
    });
  });

  describe('#getCurrentBuilderReward', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);
    });

    it('should return correct reward', async () => {
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));

      let reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(0);

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));
      await setNextTime(oneDay * 2);
      await builders.deposit(poolId, wei(3));

      reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(wei(100));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(98));
      await setNextTime(oneDay * 3);
      await builders.connect(SECOND).deposit(poolId, wei(8));

      reward = await builders.getCurrentBuilderReward(poolId);
      expect(reward).to.eq(wei(198));
    });
    it('should return 0 if pool is not exist', async () => {
      const reward = await builders.getCurrentBuilderReward(await builders.getPoolId(builderPool.name));

      expect(reward).to.eq(0);
    });
    it('should return 0 if users are not deposited', async () => {
      await setTime(100000);

      const reward = await builders.getCurrentBuilderReward(poolId);

      expect(reward).to.eq(0);
    });
    it('should return 0 if pool is not exist', async () => {
      const reward = await builders.getCurrentBuilderReward(await builders.getPoolId('bla'));

      expect(reward).to.eq(0);
    });
  });

  describe('#claim', () => {
    let poolId: string;
    let pool100Id: string;
    let pool200Id: string;

    const periodStart = 1721908800; // Start calculate multiplier from this point
    const poolStart = periodStart; // Start pool from this point

    const poolClaimLockEnd = poolStart + 1742 * oneDay;
    const pool100ClaimLockEnd = poolStart + 343 * oneDay;
    const pool200ClaimLockEnd = poolStart + 518 * oneDay;

    beforeEach(async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: poolClaimLockEnd };
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);

      const builderPool100 = {
        ...getDefaultBuilderPool(OWNER),
        name: 'Pool #100',
        claimLockEnd: pool100ClaimLockEnd,
      };
      await builders.createBuilderPool(builderPool100);
      pool100Id = await builders.getPoolId(builderPool100.name);

      const builderPool200 = {
        ...getDefaultBuilderPool(OWNER),
        name: 'Pool #200',
        claimLockEnd: pool200ClaimLockEnd,
      };
      await builders.createBuilderPool(builderPool200);
      pool200Id = await builders.getPoolId(builderPool200.name);

      await setTime(poolStart);
    });

    it('should correctly claim, one user, without redeposits', async () => {
      await builders.connect(SECOND).deposit(poolId, wei(1));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(50));
      await setNextTime(periodStart + oneDay / 2);

      const multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
      expect(multiplier).to.gt(wei(1, 25));

      await setTime(poolClaimLockEnd);
      const secondBalanceBefore = await depositToken.balanceOf(SECOND);
      const treasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(50) * (PRECISION - feeForClaim)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(FEE_TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(50) * feeForClaim) / PRECISION,
        wei(0.00001),
      );

      const userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      const builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq(wei(1));
      expect(builderPoolData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with redeposits', async () => {
      let userData, builderPoolData;

      await builders.connect(SECOND).deposit(poolId, wei(1));

      await setNextTime(periodStart + oneDay);
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));
      await builders.connect(SECOND).deposit(poolId, wei(1));

      let multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
      expect(multiplier).to.gt(wei(1, 25));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);

      await setTime(poolClaimLockEnd);
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100000000));
      const secondBalanceBefore = await depositToken.balanceOf(SECOND);
      const treasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(100000100) * (PRECISION - feeForClaim)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(FEE_TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(100000100) * feeForClaim) / PRECISION,
        wei(0.00001),
      );

      multiplier = await builders.getCurrentUserMultiplier(poolId, SECOND);
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq(wei(2));
      expect(builderPoolData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      await setNextTime(periodStart + oneDay);
      await builders.connect(SECOND).deposit(poolId, wei(1));
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));

      await setTime(poolClaimLockEnd);
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100000000));
      const secondBalanceBefore = await depositToken.balanceOf(SECOND);
      const treasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(100000100) * (PRECISION - feeForClaim)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(FEE_TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(100000100) * feeForClaim) / PRECISION,
        wei(0.00001),
      );

      const userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      const builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq(wei(1));
      expect(builderPoolData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, without redeposits', async () => {
      let userData;

      await builders.connect(SECOND).deposit(poolId, wei(1));
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));

      await builders.deposit(poolId, wei(3));
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100000000));

      await setTime(poolClaimLockEnd);
      const secondBalanceBefore = await depositToken.balanceOf(SECOND);
      const treasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(
        (wei(100000100) * (PRECISION - feeForClaim)) / PRECISION,
        wei(0.00001),
      );
      expect((await depositToken.balanceOf(FEE_TREASURY)) - treasuryBalanceBefore).to.be.closeTo(
        (wei(100000100) * feeForClaim) / PRECISION,
        wei(0.00001),
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(3));

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));

      const builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.virtualDeposited).to.eq(wei(4));
      expect(builderPoolData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few pools, different multipliers after the claim lock end', async () => {
      // Deposit after poolStart
      await builders.connect(SECOND).deposit(pool100Id, wei(1));
      await builders.connect(SECOND).deposit(pool200Id, wei(1));

      // Mint rewards to treasury
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));

      const multiplierPool100 = await builders.getCurrentUserMultiplier(pool100Id, SECOND);
      expect(multiplierPool100).closeTo(wei(2, 25), wei(0.01, 25));
      const multiplierPool200 = await builders.getCurrentUserMultiplier(pool200Id, SECOND);
      expect(multiplierPool200).closeTo(wei(3, 25), wei(0.01, 25));

      //// Claim
      await setTime(pool100ClaimLockEnd);
      let secondBalanceBefore = await depositToken.balanceOf(SECOND);
      let feeTreasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(pool100Id, SECOND);
      let secondBalanceAfter = await depositToken.balanceOf(SECOND);
      let feeTreasuryBalanceAfter = await depositToken.balanceOf(FEE_TREASURY);
      // Check that the SECOND receive funds: 100 * 0.4 - (100 * 0.4) * 0.02 = 39.2. Proportion 1:4
      expect(secondBalanceAfter - secondBalanceBefore).to.be.closeTo(wei(39.2), wei(0.1));
      // Check that the FEE_TREASURY receive funds: (100 * 0.4) * 0.02 = 0.8
      expect(feeTreasuryBalanceAfter - feeTreasuryBalanceBefore).to.be.closeTo(wei(0.8), wei(0.001));

      // Mint rewards to treasury
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(40));

      //// Claim
      await setTime(pool200ClaimLockEnd);
      secondBalanceBefore = await depositToken.balanceOf(SECOND);
      feeTreasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(pool100Id, SECOND);
      secondBalanceAfter = await depositToken.balanceOf(SECOND);
      feeTreasuryBalanceAfter = await depositToken.balanceOf(FEE_TREASURY);
      // Check that the SECOND receive funds: 40 * 0.25 - (40 * 0.25) * 0.02 = 9.8. Proportion 1:3
      expect(secondBalanceAfter - secondBalanceBefore).to.be.closeTo(wei(9.8), wei(0.1));
      // Check that the FEE_TREASURY receive funds: (40 * 0.25) * 0.02 = 0.2
      expect(feeTreasuryBalanceAfter - feeTreasuryBalanceBefore).to.be.closeTo(wei(0.2), wei(0.001));

      secondBalanceBefore = await depositToken.balanceOf(SECOND);
      feeTreasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(pool200Id, SECOND);
      secondBalanceAfter = await depositToken.balanceOf(SECOND);
      feeTreasuryBalanceAfter = await depositToken.balanceOf(FEE_TREASURY);
      // Check that the SECOND receive funds: 100 * 0.6 - (100 * 0.6) * 0.02 + 40 * 0.75 - (40 * 0.75) * 0.02 = 88.2. Proportion 2:3 + 1:3
      expect(secondBalanceAfter - secondBalanceBefore).to.be.closeTo(wei(88.2), wei(0.1));
      // // Check that the FEE_TREASURY receive funds: (100 * 0.6) * 0.02 + (40 * 0.75) * 0.02 = 1.4
      expect(feeTreasuryBalanceAfter - feeTreasuryBalanceBefore).to.be.closeTo(wei(1.8), wei(0.001));
    });
    it('should not pay fee, if percent is zero', async () => {
      await feeConfig.setFeeForOperation(builders, claimOperation, 0);

      await builders.connect(SECOND).deposit(poolId, wei(1));
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(198));

      await setTime(poolClaimLockEnd);
      const secondBalanceBefore = await depositToken.balanceOf(SECOND);
      const treasuryBalanceBefore = await depositToken.balanceOf(FEE_TREASURY);
      await builders.claim(poolId, SECOND);
      expect((await depositToken.balanceOf(SECOND)) - secondBalanceBefore).to.be.closeTo(wei(198), wei(0.00001));
      expect((await depositToken.balanceOf(FEE_TREASURY)) - treasuryBalanceBefore).to.be.equal(0);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(builders.connect(SECOND).claim(await builders.getPoolId('bla'), SECOND)).to.be.revertedWith(
        "BU: pool doesn't exist",
      );
    });
    it('should revert if nothing to claim', async () => {
      await setTime(poolClaimLockEnd);
      await expect(builders.claim(poolId, SECOND)).to.be.revertedWith('BU: nothing to claim');
    });
    it('should revert if caller is not-admin of the pool', async () => {
      await expect(builders.connect(SECOND).claim(poolId, SECOND)).to.be.revertedWith(
        'BU: only admin can claim rewards',
      );
    });
    it('should revert if claim is locked', async () => {
      await expect(builders.claim(poolId, SECOND)).to.be.revertedWith('BU: claim is locked');
    });
  });

  describe('#withdraw', () => {
    let poolId: string;
    let claimLockEnd: number;

    beforeEach(async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), withdrawLockPeriodAfterDeposit: oneDay - 1 };
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);
      claimLockEnd = Number(builderPool.claimLockEnd);
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      let userData, builderPoolData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).deposit(poolId, wei(1));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));
      await setNextTime(oneDay + oneDay);
      await builders.deposit(poolId, wei(3));

      // Withdraw after 2 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(98));
      await setNextTime(oneDay + oneDay * 2);
      let tx = await builders.withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, FEE_TREASURY],
        [(wei(3) * (PRECISION - feeForWithdraw)) / PRECISION, (wei(3) * feeForWithdraw) / PRECISION],
      );

      await setTime(claimLockEnd);
      tx = await builders.claim(poolId, OWNER);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, FEE_TREASURY],
        [(wei(198) * (PRECISION - feeForClaim)) / PRECISION, (wei(198) * feeForClaim) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);
      expect(await depositToken.balanceOf(builders)).to.eq(wei(1));

      // Claim after 3 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(96));
      await setNextTime(claimLockEnd + oneDay * 3);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(96) * (PRECISION - feeForClaim)) / PRECISION, (wei(96) * feeForClaim) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(94));
      await setNextTime(claimLockEnd + oneDay * 4);
      tx = await builders.connect(SECOND).withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(1) * (PRECISION - feeForWithdraw)) / PRECISION, (wei(1) * feeForWithdraw) / PRECISION],
      );

      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(94) * (PRECISION - feeForClaim)) / PRECISION, (wei(94) * feeForClaim) / PRECISION],
      );

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(0));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);
      expect(await depositToken.balanceOf(builders)).to.eq(wei(0));

      await expect(builders.claim(poolId, OWNER)).to.be.revertedWith('BU: nothing to claim');
      await expect(builders.claim(poolId, SECOND)).to.be.revertedWith('BU: nothing to claim');
    });
    it('should correctly withdraw, few users, withdraw part', async () => {
      let userData, builderPoolData;

      await setNextTime(oneDay);
      await builders.connect(SECOND).deposit(poolId, wei(4));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));
      await setNextTime(oneDay + oneDay);
      await builders.deposit(poolId, wei(6));

      // Withdraw after 2 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(98));
      await setNextTime(oneDay + oneDay * 2);
      let tx = await builders.withdraw(poolId, wei(2));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, FEE_TREASURY],
        [(wei(2) * (PRECISION - feeForWithdraw)) / PRECISION, (wei(2) * feeForWithdraw) / PRECISION],
      );

      await setTime(claimLockEnd);
      tx = await builders.claim(poolId, OWNER);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [OWNER, FEE_TREASURY],
        [(wei(198) * (PRECISION - feeForClaim)) / PRECISION, (wei(198) * feeForClaim) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(96));
      await setNextTime(claimLockEnd + oneDay * 3);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(96) * (PRECISION - feeForClaim)) / PRECISION, (wei(96) * feeForClaim) / PRECISION],
      );

      userData = await builders.usersData(OWNER, poolId);

      expect(userData.deposited).to.eq(wei(4));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(94));
      await setNextTime(claimLockEnd + oneDay * 4);
      tx = await builders.connect(SECOND).withdraw(poolId, wei(2));
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(2) * (PRECISION - feeForWithdraw)) / PRECISION, (wei(2) * feeForWithdraw) / PRECISION],
      );

      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalances(
        depositToken,
        [SECOND, FEE_TREASURY],
        [(wei(94) * (PRECISION - feeForClaim)) / PRECISION, (wei(94) * feeForClaim) / PRECISION],
      );
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      // Claim after 5 days
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(92));
      await setNextTime(claimLockEnd + oneDay * 5);
      tx = await builders.claim(poolId, SECOND);
      await expect(tx).to.changeTokenBalance(depositToken, SECOND, (wei(92) * (PRECISION - feeForClaim)) / PRECISION);
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(4));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);

      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(2));
      builderPoolData = await builders.buildersPoolData(poolId);
      expect(builderPoolData.pendingRewards).to.eq(0);
    });
    it('should not pay fee, if percent is zero', async () => {
      await feeConfig.setFeeForOperation(builders, withdrawOperation, 0);

      await setNextTime(oneDay);
      await builders.deposit(poolId, wei(1));

      await setNextTime(oneDay * 3);

      const tx = await builders.withdraw(poolId, wei(1));
      await expect(tx).to.changeTokenBalances(depositToken, [OWNER, FEE_TREASURY], [wei(1), 0]);
    });
    it('should revert if trying to withdraw zero', async () => {
      await expect(builders.withdraw(poolId, 0)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if user didn't deposit", async () => {
      await expect(builders.withdraw(poolId, 1)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if pool isn't found", async () => {
      await expect(builders.withdraw(await builders.getPoolId('bla'), 1)).to.be.revertedWith("BU: pool doesn't exist");
    });
    it("should revert if `minimaldeposit` didn't pass", async () => {
      await setNextTime(oneDay);

      await builders.deposit(poolId, wei(1));

      await setNextTime(oneDay + oneDay * 2);

      await expect(builders.withdraw(poolId, wei(0.99))).to.be.revertedWith('BU: invalid withdraw amount');
    });
    it("should revert if `withdrawLockPeriodAfterDeposit` didn't pass", async () => {
      await setNextTime(oneDay * 10);

      await builders.deposit(poolId, wei(1));

      await expect(builders.withdraw(poolId, wei(0.1))).to.be.revertedWith('BU: user withdraw is locked');
    });
    it('should revert if personal withdraw is locked', async () => {
      await setNextTime(oneDay);

      await builders.deposit(poolId, wei(1));

      await depositToken.connect(MINTER).mint(buildersTreasury, wei(100));

      await expect(builders.withdraw(poolId, wei(1))).to.be.revertedWith('BU: user withdraw is locked');
    });
  });

  describe('#withdraw', () => {
    const payoutStart = 1707393600;

    let poolId: string;

    beforeEach(async () => {
      const builderPool = {
        ...getDefaultBuilderPool(OWNER),
        withdrawLockPeriodAfterDeposit: oneDay - 1,
        poolStart: payoutStart,
        claimLockEnd: payoutStart + 365 * 10 * oneDay,
      };
      await builders.createBuilderPool(builderPool);
      poolId = await builders.getPoolId(builderPool.name);
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      // multiplier = 10.7
      // const multiplier = await builders.getLockPeriodMultiplier(
      //   payoutStart + 365 * oneDay,
      //   payoutStart + 365 * 10 * oneDay,
      // );

      // Add tokens for user #3
      await depositToken.connect(MINTER).mint(MINTER, wei(100));
      await depositToken.connect(MINTER).approve(builders, wei(100));

      // Move to the future
      await setNextTime(payoutStart + 365 * oneDay);

      // Deposits
      await builders.connect(OWNER).deposit(poolId, wei(1));
      let userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1 * 10.7));
      let totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(1));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(1 * 10.7), wei(0.0001));
      let buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(1));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(1 * 10.7), wei(0.0001));

      await builders.connect(SECOND).deposit(poolId, wei(1));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1 * 10.7));
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(2));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(2 * 10.7), wei(0.0001));
      buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(2));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(2 * 10.7), wei(0.0001));

      await builders.connect(MINTER).deposit(poolId, wei(1));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1 * 10.7));
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(3));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(3 * 10.7), wei(0.0001));
      buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(3));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(3 * 10.7), wei(0.0001));

      // Move to the future
      await setNextTime(payoutStart + 365 * 10 * oneDay);
      await depositToken.connect(MINTER).mint(buildersTreasury, wei(66));
      await builders.claim(poolId, OWNER);

      // Withdrawals
      await builders.connect(OWNER).withdraw(poolId, wei(999));
      userData = await builders.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(2));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(2), wei(0.0001));
      buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(2));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(2), wei(0.0001));

      await builders.connect(SECOND).withdraw(poolId, wei(999));
      userData = await builders.usersData(SECOND, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(1));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(1), wei(0.0001));
      buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(1));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(1), wei(0.0001));

      await builders.connect(MINTER).withdraw(poolId, wei(999));
      userData = await builders.usersData(MINTER, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      totalPoolData = await builders.totalPoolData();
      expect(totalPoolData.totalDeposited).to.eq(wei(0));
      expect(totalPoolData.totalVirtualDeposited).to.closeTo(wei(0), wei(0.0001));
      buildersPoolData = await builders.buildersPoolData(poolId);
      expect(buildersPoolData.deposited).to.eq(wei(0));
      expect(buildersPoolData.virtualDeposited).to.closeTo(wei(0), wei(0.0001));
    });
  });
});

// npx hardhat test "test/builders/BuildersV2.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builders/BuildersV2.test.ts"

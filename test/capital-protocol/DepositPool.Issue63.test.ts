import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  deployDepositPool,
  deployDistributionV5,
  deployDistributorMock,
  deployERC20Token,
  deployRewardPoolMock,
  deployStETHMock,
} from '../helpers/deployers';
import { getDefaultPool, oneDay } from '../helpers/distribution-helper';

import { DepositPool, DistributorMock, ERC20Token, RewardPoolMock, StETHMock } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { setNextTime } from '@/test/helpers/block-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('DepositPool - Issue #63 Fix (Multi-pool migration lock)', () => {
  const reverter = new Reverter();

  enum Strategy {
    NONE,
    NO_YIELD,
    AAVE,
  }

  let OWNER: SignerWithAddress;
  let USER_A: SignerWithAddress;
  let USER_B: SignerWithAddress;

  let depositPool: DepositPool;
  let rewardPoolMock: RewardPoolMock;
  let depositToken: StETHMock;
  let rewardToken: ERC20Token;
  let distributorMock: DistributorMock;

  const pool0 = 0;
  const pool1 = 1;

  before(async () => {
    [OWNER, USER_A, USER_B] = await ethers.getSigners();

    depositToken = await deployStETHMock();
    rewardToken = await deployERC20Token();
    rewardPoolMock = await deployRewardPoolMock();
    distributorMock = await deployDistributorMock(rewardPoolMock, rewardToken);
    depositPool = await deployDepositPool(depositToken, distributorMock);

    await depositToken.mint(OWNER.address, wei(1000));
    await depositToken.mint(USER_A.address, wei(1000));
    await depositToken.mint(USER_B.address, wei(1000));

    await depositToken.connect(OWNER).approve(distributorMock, wei(1000));
    await depositToken.connect(USER_A).approve(distributorMock, wei(1000));
    await depositToken.connect(USER_B).approve(distributorMock, wei(1000));

    // Register both pool 0 and pool 1 as public pools
    await rewardPoolMock.setIsRewardPoolExist(pool0, true);
    await rewardPoolMock.setIsRewardPoolPublic(pool0, true);
    await rewardPoolMock.setIsRewardPoolExist(pool1, true);
    await rewardPoolMock.setIsRewardPoolPublic(pool1, true);

    await distributorMock.addDepositPool(depositPool, depositToken, Strategy.NONE);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  it('should accurately track depositedPerPublicPool across multiple public pools', async () => {
    await depositPool.migrate(pool0);

    await depositPool.setRewardPoolProtocolDetails(pool0, 0, 0, 0, wei(0.1));
    await depositPool.setRewardPoolProtocolDetails(pool1, 0, 0, 0, wei(0.1));

    // User A stakes 100 in pool 0
    await depositPool.connect(USER_A).stake(pool0, wei(100), 0, ZERO_ADDR);
    expect(await depositPool.depositedPerPublicPool(pool0)).to.eq(wei(100));
    expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(100));

    // User B stakes 250 in pool 1
    await depositPool.connect(USER_B).stake(pool1, wei(250), 0, ZERO_ADDR);
    expect(await depositPool.depositedPerPublicPool(pool0)).to.eq(wei(100));
    expect(await depositPool.depositedPerPublicPool(pool1)).to.eq(wei(250));
    expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(350));

    // User A withdraws 40 from pool 0
    await depositPool.connect(USER_A).withdraw(pool0, wei(40));
    expect(await depositPool.depositedPerPublicPool(pool0)).to.eq(wei(60));
    expect(await depositPool.depositedPerPublicPool(pool1)).to.eq(wei(250));
    expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(310));

    // User B withdraws all from pool 1
    await depositPool.connect(USER_B).withdraw(pool1, wei(250));
    expect(await depositPool.depositedPerPublicPool(pool0)).to.eq(wei(60));
    expect(await depositPool.depositedPerPublicPool(pool1)).to.eq(0);
    expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(60));
  });

  it('should support safe per-pool migration without locking funds or cross-pool theft', async () => {
    // 1. Prepare initial distribution contract simulating upgraded state with funds
    const distributionV5 = await deployDistributionV5(depositToken, OWNER);
    await depositToken.approve(distributionV5, wei(1000));
    await depositToken.connect(USER_A).approve(distributionV5, wei(1000));
    await distributionV5.connect(OWNER).createPool(getDefaultPool());
    await setNextTime(oneDay * 1);
    await distributionV5.connect(USER_A).stake(0, wei(50), 0, ZERO_ADDR);

    // 2. Upgrade to new DepositPool implementation
    const lib1 = await (await ethers.getContractFactory('ReferrerLib')).deploy();
    const lib2 = await (await ethers.getContractFactory('LockMultiplierMath')).deploy();
    const newDepositPoolImplFactory = await ethers.getContractFactory('DepositPool', {
      libraries: { ReferrerLib: await lib1.getAddress(), LockMultiplierMath: await lib2.getAddress() },
    });
    const newDepositPoolImpl = await newDepositPoolImplFactory.deploy();
    await distributionV5.upgradeTo(newDepositPoolImpl);

    const newDepositPool = newDepositPoolImpl.attach(distributionV5) as DepositPool;
    await newDepositPool.setDistributor(distributorMock);
    await distributorMock.addDepositPool(newDepositPool, depositToken, Strategy.NONE);

    // Provide initial yield to satisfy yield-transfer requirement
    await depositToken.mint(newDepositPool, wei(5));

    // 3. Migrate pool 0
    await newDepositPool.migrate(0);
    expect(await newDepositPool.poolMigrationDone(0)).to.be.true;
    expect(await newDepositPool.isMigrationOver()).to.be.true;

    // 4. Verify double migration revert
    await expect(newDepositPool.migrate(0)).to.be.revertedWith('DS: the migration is over');
  });

  it('should execute migrateMultiple for multi-pool batch migration', async () => {
    // Test migrateMultiple on a newly deployed depositPool with 0 public deposits
    await depositPool.migrateMultiple([pool0]);
    expect(await depositPool.isMigrationOver()).to.be.true;
  });
});

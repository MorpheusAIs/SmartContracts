import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import {
  getDefaultBuilderPool,
  getDefaultBuildersPoolData,
  getDefaultSubnetMetadata,
} from '../helpers/builders-helper';
import { deployBuilderSubnets, deployBuilders, deployFeeConfig, deployMOROFT } from '../helpers/deployers';
import { oneDay, oneHour } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { Builders, BuildersTreasury, BuildersV3, FeeConfig, MOROFT } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('BuildersV3', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let MIGRATION_OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;

  let builders: Builders;

  let buildersTreasury: BuildersTreasury;
  let feeConfig: FeeConfig;
  let token: MOROFT;

  before(async () => {
    [OWNER, MIGRATION_OWNER, BOB, FEE_TREASURY, MINTER] = await ethers.getSigners();

    token = await deployMOROFT(101, OWNER, OWNER, MINTER);
    feeConfig = await deployFeeConfig(FEE_TREASURY);
    const { builders: builders_, buildersTreasury: buildersTreasury_ } = await deployBuilders(
      token,
      feeConfig,
      oneHour,
      oneHour * 0.5,
    );
    builders = builders_;
    buildersTreasury = buildersTreasury_;

    await token.connect(MINTER).mint(OWNER, wei(1000));
    await token.connect(MINTER).mint(BOB, wei(1000));
    await token.approve(builders, wei(1000));
    await token.connect(BOB).approve(builders, wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const buildersV3 = await upgradeToV3(builders);

        expect(await buildersV3.version()).to.eq(3);
      });
    });
  });

  describe('#setMigrationOwner', () => {
    it('should set new value', async () => {
      const buildersV3 = await upgradeToV3(builders);

      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      expect(await buildersV3.migrationOwner()).to.eq(MIGRATION_OWNER);

      await buildersV3.setMigrationOwner(BOB);
      expect(await buildersV3.migrationOwner()).to.eq(BOB);
    });
    it('should revert if caller is not the owner', async () => {
      const buildersV3 = await upgradeToV3(builders);

      await expect(buildersV3.connect(BOB).setMigrationOwner(MIGRATION_OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#pause', () => {
    it('should set new value', async () => {
      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);

      await buildersV3.connect(OWNER).pause();
      expect(await buildersV3.isPaused()).to.eq(true);
    });
    it('should revert if caller is not the owner', async () => {
      const buildersV3 = await upgradeToV3(builders);

      await expect(buildersV3.connect(BOB).pause()).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#isPausedForMigration', () => {
    it('should set new value', async () => {
      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();

      await buildersV3.connect(MIGRATION_OWNER).pauseForMigration();
      expect(await buildersV3.isPausedForMigration()).to.eq(true);
    });
    it('should revert if not paused', async () => {
      const buildersV3 = await upgradeToV3(builders);

      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await expect(buildersV3.connect(MIGRATION_OWNER).pauseForMigration()).to.be.revertedWith('BU: not paused');
    });
    it('should revert if caller is not the migration owner', async () => {
      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.connect(OWNER).pause();

      await expect(buildersV3.pauseForMigration()).to.be.revertedWith('BU: caller is not the migration owner');
    });
  });

  describe('#setBuilderSubnets', () => {
    it('should set new value', async () => {
      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);

      const builderSubnets = await deployBuilderSubnets(token, feeConfig, MINTER, 0, buildersV3);

      await buildersV3.connect(MIGRATION_OWNER).setBuilderSubnets(builderSubnets);
      expect(await buildersV3.builderSubnets()).to.eq(await builderSubnets.getAddress());
    });
    it('should revert if caller is not the migration owner', async () => {
      const buildersV3 = await upgradeToV3(builders);

      await expect(buildersV3.setBuilderSubnets(MINTER)).to.be.revertedWith('BU: caller is not the migration owner');
    });
    it('should revert if invalid contract', async () => {
      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);

      const BuildersV3Mock = await ethers.getContractFactory('L1Sender');
      const buildersV3Mock = await BuildersV3Mock.deploy();

      await expect(buildersV3.connect(MIGRATION_OWNER).setBuilderSubnets(buildersV3Mock)).to.be.revertedWith(
        'BU: invalid contract',
      );
    });
  });

  describe('#should pause, main functionality', () => {
    it('should pause builder pools creation', async () => {
      await builders.connect(BOB).createBuilderPool(getDefaultBuilderPool(OWNER));

      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await expect(buildersV3.createBuilderPool(getDefaultBuilderPool(OWNER))).to.be.revertedWith('BU: paused');
    });
    it('should pause builder pools edits', async () => {
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await builders.connect(OWNER).editBuilderPool(getDefaultBuilderPool(OWNER));

      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await expect(buildersV3.editBuilderPool(getDefaultBuilderPool(OWNER))).to.be.revertedWith('BU: paused');
    });
    it('should pause deposits', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));

      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await expect(buildersV3.deposit(poolId, wei(1))).to.be.revertedWith('BU: paused');
    });
    it('should allow claim and withdraw', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));

      await setNextTime(oneDay * 100);
      await token.connect(MINTER).mint(buildersTreasury, wei(50));
      await builders.claim(poolId, OWNER);
      await builders.withdraw(poolId, wei(1));
    });
  });

  describe('#should pause for migration, main functionality', () => {
    it('should pause withdraws', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));
      await setNextTime(oneDay * 5);
      await builders.withdraw(poolId, wei(0.1));

      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await buildersV3.connect(MIGRATION_OWNER).pauseForMigration();
      await expect(buildersV3.withdraw(poolId, wei(0.1))).to.be.revertedWith('BU: paused');
    });
    it('should pause claim', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 10 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));
      await setNextTime(oneDay * 20);
      await token.connect(MINTER).mint(buildersTreasury, wei(50));
      await builders.claim(poolId, BOB);
      await token.connect(MINTER).mint(buildersTreasury, wei(50));

      const buildersV3 = await upgradeToV3(builders);
      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await buildersV3.connect(MIGRATION_OWNER).pauseForMigration();
      await expect(buildersV3.claim(poolId, BOB)).to.be.revertedWith('BU: paused');
    });
  });

  describe('#migrateUserStake', () => {
    it('should correctly migrate user stakes', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: 120 * oneDay };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));

      await setNextTime(oneDay * 110);
      await builders.deposit(poolId, wei(10));
      await builders.connect(BOB).deposit(poolId, wei(20));

      const subnet = {
        name: builderPool.name,
        owner: builderPool.admin,
        minStake: builderPool.minimalDeposit,
        fee: wei(1, 25),
        feeTreasury: builderPool.admin,
        startsAt: builderPool.poolStart,
        withdrawLockPeriodAfterStake: builderPool.withdrawLockPeriodAfterDeposit,
        maxClaimLockEnd: builderPool.claimLockEnd,
      };

      const buildersV3 = await upgradeToV3(builders);

      const builderSubnets = await deployBuilderSubnets(token, feeConfig, MINTER, 0, buildersV3);
      await builderSubnets.createSubnet(subnet, getDefaultSubnetMetadata());
      await builderSubnets.setBuildersRewardPoolData(getDefaultBuildersPoolData());

      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await buildersV3.connect(MIGRATION_OWNER).pauseForMigration();

      await buildersV3.connect(MIGRATION_OWNER).setBuilderSubnets(builderSubnets);

      await setNextTime(oneDay * 111);
      await buildersV3.connect(OWNER).migrateUserStake(poolId);

      expect(await buildersV3.isBuilderPoolUserMigrate(poolId, OWNER)).to.eq(true);
      expect(await buildersV3.totalDepositsMigrated()).to.eq(wei(10));
      let staker = await builderSubnets.stakers(poolId, OWNER);
      expect(staker.lastStake).to.eq(oneDay * 111);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      let buildersSubnetData = await builderSubnets.subnetsData(poolId);
      expect(buildersSubnetData).to.eq(wei(10));
      let allSubnetsData = await builderSubnets.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(10));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 111);
      expect(await token.balanceOf(buildersV3)).to.eq(wei(20));
      expect(await token.balanceOf(builderSubnets)).to.eq(wei(10));

      await buildersV3.connect(BOB).migrateUserStake(poolId);

      expect(await buildersV3.isBuilderPoolUserMigrate(poolId, BOB)).to.eq(true);
      expect(await buildersV3.totalDepositsMigrated()).to.eq(wei(30));
      staker = await builderSubnets.stakers(poolId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 111 + 1);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.pendingRewards).to.eq(wei(0));
      buildersSubnetData = await builderSubnets.subnetsData(poolId);
      expect(buildersSubnetData).to.eq(wei(30));
      allSubnetsData = await builderSubnets.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(30));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 111 + 1);
      expect(await token.balanceOf(buildersV3)).to.eq(wei(0));
      expect(await token.balanceOf(builderSubnets)).to.eq(wei(30));
    });
  });

  describe('#migrateUsersStake', () => {
    it('should correctly migrate user stakes', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: 120 * oneDay };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));

      await setNextTime(oneDay * 110);
      await builders.deposit(poolId, wei(10));
      await builders.connect(BOB).deposit(poolId, wei(20));

      const subnet = {
        name: builderPool.name,
        owner: builderPool.admin,
        minStake: builderPool.minimalDeposit,
        fee: wei(1, 25),
        feeTreasury: builderPool.admin,
        startsAt: builderPool.poolStart,
        withdrawLockPeriodAfterStake: builderPool.withdrawLockPeriodAfterDeposit,
        maxClaimLockEnd: builderPool.claimLockEnd,
      };

      const buildersV3 = await upgradeToV3(builders);

      const builderSubnets = await deployBuilderSubnets(token, feeConfig, MINTER, 0, buildersV3);
      await builderSubnets.createSubnet(subnet, getDefaultSubnetMetadata());
      await builderSubnets.setBuildersRewardPoolData(getDefaultBuildersPoolData());

      await buildersV3.setMigrationOwner(MIGRATION_OWNER);
      await buildersV3.connect(OWNER).pause();
      await buildersV3.connect(MIGRATION_OWNER).pauseForMigration();
      await buildersV3.connect(MIGRATION_OWNER).setBuilderSubnets(builderSubnets);

      await setNextTime(oneDay * 111);
      await buildersV3.connect(MIGRATION_OWNER).migrateUsersStake([poolId, poolId], [OWNER, BOB]);

      expect(await buildersV3.isBuilderPoolUserMigrate(poolId, OWNER)).to.eq(true);
      expect(await buildersV3.totalDepositsMigrated()).to.eq(wei(30));
      let staker = await builderSubnets.stakers(poolId, OWNER);
      expect(staker.lastStake).to.eq(oneDay * 111);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      const buildersSubnetData = await builderSubnets.subnetsData(poolId);
      expect(buildersSubnetData).to.eq(wei(30));
      const allSubnetsData = await builderSubnets.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(30));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 111);
      expect(await token.balanceOf(buildersV3)).to.eq(wei(0));
      expect(await token.balanceOf(builderSubnets)).to.eq(wei(30));

      staker = await builderSubnets.stakers(poolId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 111);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.pendingRewards).to.eq(wei(0));
    });
  });

  const upgradeToV3 = async (buildersV1: Builders): Promise<BuildersV3> => {
    const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
    const [lib2] = await Promise.all([await lib2Factory.deploy()]);

    const BuildersV3 = await ethers.getContractFactory('BuildersV3', {
      libraries: {
        LockMultiplierMath: await lib2.getAddress(),
      },
    });
    const buildersV3Impl = await BuildersV3.deploy();

    await buildersV1.upgradeTo(buildersV3Impl);
    const buildersV3 = buildersV3Impl.attach(builders) as BuildersV3;

    return buildersV3;
  };
});

// npx hardhat test "test/builders/BuildersV3.test.ts"

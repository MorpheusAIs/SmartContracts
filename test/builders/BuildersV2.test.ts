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

import { BuilderSubnets, Builders, BuildersTreasury, BuildersV2, FeeConfig, MOROFT } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('BuildersV2', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let MIGRATION_OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;

  let builders: Builders;
  let builderSubnets: BuilderSubnets;

  let buildersTreasury: BuildersTreasury;
  let feeConfig: FeeConfig;
  let token: MOROFT;

  before(async () => {
    [OWNER, MIGRATION_OWNER, BOB, FEE_TREASURY, MINTER] = await ethers.getSigners();

    token = await deployMOROFT(101, OWNER, OWNER, MINTER);
    feeConfig = await deployFeeConfig(FEE_TREASURY);
    builderSubnets = await deployBuilderSubnets(token, feeConfig, MINTER, 0);
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
        const buildersV2 = await upgradeToV2(builders);

        expect(await buildersV2.version()).to.eq(2);
      });
    });
  });

  describe('#setMigrationOwner', () => {
    it('should set new value', async () => {
      const buildersV2 = await upgradeToV2(builders);

      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      expect(await buildersV2.migrationOwner()).to.eq(MIGRATION_OWNER);

      await buildersV2.setMigrationOwner(BOB);
      expect(await buildersV2.migrationOwner()).to.eq(BOB);
    });
    it('should revert if caller is not the owner', async () => {
      const buildersV2 = await upgradeToV2(builders);

      await expect(buildersV2.connect(BOB).setMigrationOwner(MIGRATION_OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setIsPaused', () => {
    it('should set new value', async () => {
      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);

      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      expect(await buildersV2.isPaused()).to.eq(true);

      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(false);
      expect(await buildersV2.isPaused()).to.eq(false);
    });
    it('should revert if caller is not the migration owner', async () => {
      const buildersV2 = await upgradeToV2(builders);

      await expect(buildersV2.setIsPaused(true)).to.be.revertedWith('BU: caller is not the migration owner');
    });
  });

  describe('#setBuilderSubnets', () => {
    it('should set new value', async () => {
      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);

      await buildersV2.connect(MIGRATION_OWNER).setBuilderSubnets(builderSubnets);
      expect(await buildersV2.builderSubnets()).to.eq(await builderSubnets.getAddress());
    });
    it('should revert if caller is not the migration owner', async () => {
      const buildersV2 = await upgradeToV2(builders);

      await expect(buildersV2.setBuilderSubnets(MINTER)).to.be.revertedWith('BU: caller is not the migration owner');
    });
    it('should revert if', async () => {
      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);

      const BuildersV2Mock = await ethers.getContractFactory('BuildersV2');
      const buildersV2Mock = await BuildersV2Mock.deploy();

      await expect(buildersV2.connect(MIGRATION_OWNER).setBuilderSubnets(buildersV2Mock)).to.be.revertedWith(
        'BU: invalid contract',
      );
    });
  });

  describe('#should pause main functionality', () => {
    it('should pause builder pools creation', async () => {
      await builders.connect(BOB).createBuilderPool(getDefaultBuilderPool(OWNER));

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await expect(buildersV2.createBuilderPool(getDefaultBuilderPool(OWNER))).to.be.revertedWith('BU: paused');
    });
    it('should pause builder pools edits', async () => {
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await builders.connect(OWNER).editBuilderPool(getDefaultBuilderPool(OWNER));

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await expect(buildersV2.editBuilderPool(getDefaultBuilderPool(OWNER))).to.be.revertedWith('BU: paused');
    });
    it('should pause deposits', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await expect(buildersV2.deposit(poolId, wei(1))).to.be.revertedWith('BU: paused');
    });
    it('should pause withdraws', async () => {
      const builderPool = { ...getDefaultBuilderPool(OWNER), claimLockEnd: oneDay * 9999999 };
      const poolId = await builders.getPoolId(builderPool.name);
      await builders.connect(OWNER).createBuilderPool(getDefaultBuilderPool(OWNER));
      await setNextTime(oneDay * 1);
      await builders.deposit(poolId, wei(1));
      await setNextTime(oneDay * 5);
      await builders.withdraw(poolId, wei(0.1));

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await expect(buildersV2.withdraw(poolId, wei(0.1))).to.be.revertedWith('BU: paused');
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

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await expect(buildersV2.claim(poolId, BOB)).to.be.revertedWith('BU: paused');
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
        minClaimLockEnd: builderPool.claimLockEnd,
      };

      await builderSubnets.createSubnet(subnet, getDefaultSubnetMetadata());
      await builderSubnets.setMaxStakedShareFromBuildersPool(wei(1, 25));
      await builderSubnets.setBuildersPoolData(getDefaultBuildersPoolData());

      const buildersV2 = await upgradeToV2(builders);
      await buildersV2.setMigrationOwner(MIGRATION_OWNER);
      await buildersV2.connect(MIGRATION_OWNER).setIsPaused(true);
      await buildersV2.connect(MIGRATION_OWNER).setBuilderSubnets(builderSubnets);

      await setNextTime(oneDay * 111);
      await buildersV2.connect(MIGRATION_OWNER).migrateUserStake(poolId, OWNER);

      expect(await buildersV2.isBuilderPoolUserMigrate(poolId, OWNER)).to.eq(true);
      expect(await buildersV2.totalDepositsMigrated()).to.eq(wei(10));
      let staker = await builderSubnets.stakers(poolId, OWNER);
      expect(staker.lastStake).to.eq(oneDay * 111);
      expect(staker.lastInteraction).to.eq(oneDay * 111);
      expect(staker.claimLockEnd).to.eq(oneDay * 120);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.virtualStaked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      let buildersSubnetData = await builderSubnets.buildersSubnetsData(poolId);
      expect(buildersSubnetData.staked).to.eq(wei(10));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(10));
      expect(await builderSubnets.totalStaked()).to.eq(wei(10));
      expect(await token.balanceOf(buildersV2)).to.eq(wei(20));
      expect(await token.balanceOf(builderSubnets)).to.eq(wei(10));

      await buildersV2.connect(MIGRATION_OWNER).migrateUserStake(poolId, BOB);

      expect(await buildersV2.isBuilderPoolUserMigrate(poolId, BOB)).to.eq(true);
      expect(await buildersV2.totalDepositsMigrated()).to.eq(wei(30));
      staker = await builderSubnets.stakers(poolId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 111 + 1);
      expect(staker.lastInteraction).to.eq(oneDay * 111 + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 120);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.virtualStaked).to.eq(wei(20));
      expect(staker.pendingRewards).to.eq(wei(0));
      buildersSubnetData = await builderSubnets.buildersSubnetsData(poolId);
      expect(buildersSubnetData.staked).to.eq(wei(30));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(30));
      expect(await builderSubnets.totalStaked()).to.eq(wei(30));
      expect(await token.balanceOf(buildersV2)).to.eq(wei(0));
      expect(await token.balanceOf(builderSubnets)).to.eq(wei(30));
    });
  });

  const upgradeToV2 = async (buildersV1: Builders): Promise<BuildersV2> => {
    const BuildersV2 = await ethers.getContractFactory('BuildersV2');
    const buildersV2Impl = await BuildersV2.deploy();

    await buildersV1.upgradeTo(buildersV2Impl);
    const buildersV2 = buildersV2Impl.attach(builders) as BuildersV2;

    return buildersV2;
  };
});

// npx hardhat test "test/builders/BuildersV2.test.ts"

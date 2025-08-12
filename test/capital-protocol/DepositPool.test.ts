import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { MaxUint256 } from 'ethers';
import { ethers } from 'hardhat';

import {
  deployAavePoolDataProviderMock,
  deployAavePoolMock,
  deployDepositPool,
  deployDistributionV5,
  deployDistributorMock,
  deployERC20Token,
  deployInterfaceMock,
  deployRewardPoolMock,
  deployStETHMock,
} from '../helpers/deployers';
import { getDefaultPool, getDefaultReferrerTiers, oneDay, oneHour } from '../helpers/distribution-helper';

import { DepositPool, DistributorMock, ERC20Token, RewardPoolMock, StETHMock } from '@/generated-types/ethers';
import { PRECISION, ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setNextTime, setTime } from '@/test/helpers/block-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('DepositPool', () => {
  const reverter = new Reverter();

  enum Strategy {
    NONE,
    NO_YIELD,
    AAVE,
  }

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let REFERRER_1: SignerWithAddress;
  let REFERRER_2: SignerWithAddress;

  let depositPool: DepositPool;
  let rewardPoolMock: RewardPoolMock;
  let depositToken: StETHMock;
  let rewardToken: ERC20Token;
  let distributorMock: DistributorMock;

  const rewardPoolId = 0;

  before(async () => {
    [OWNER, SECOND, REFERRER_1, REFERRER_2] = await ethers.getSigners();

    depositToken = await deployStETHMock();
    rewardToken = await deployERC20Token();
    rewardPoolMock = await deployRewardPoolMock();
    distributorMock = await deployDistributorMock(rewardPoolMock, rewardToken);
    depositPool = await deployDepositPool(depositToken, distributorMock);

    await depositToken.mint(OWNER.address, wei(1000));
    await depositToken.mint(SECOND.address, wei(1000));
    await depositToken.connect(OWNER).approve(depositPool, wei(1000));
    await depositToken.connect(SECOND).approve(depositPool, wei(1000));

    // Setup mock env
    await rewardPoolMock.setIsRewardPoolExist(rewardPoolId, true);
    await rewardPoolMock.setIsRewardPoolPublic(rewardPoolId, true);
    await distributorMock.addDepositPool(depositPool, depositToken, Strategy.NONE);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(depositPool.DepositPool_init(OWNER, OWNER)).to.be.revertedWith(reason);
      });
    });

    describe('#DepositPool_init', () => {
      it('should set correct data after creation', async () => {
        expect(await depositPool.depositToken()).to.eq(depositToken);
        expect(await depositPool.distributor()).to.eq(distributorMock);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should upgrade to the new version', async () => {
        const [factory] = await Promise.all([ethers.getContractFactory('FeeConfigV2')]);
        const contract = await factory.deploy();

        await depositPool.upgradeTo(contract);
        expect(await depositPool.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(depositPool.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
      it('should revert if `isNotUpgradeable == true`', async () => {
        await depositPool.removeUpgradeability();

        await expect(depositPool.upgradeTo(ZERO_ADDR)).to.be.revertedWith("DS: upgrade isn't available");
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IDepositPool', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await depositPool.supportsInterface(await interfaceMock.getIDepositPoolInterfaceId())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await depositPool.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setDistributor', () => {
    it('should set `Distributor`', async () => {
      expect(await depositToken.allowance(depositPool, distributorMock)).to.eq(MaxUint256);

      const newDistributor = await deployDistributorMock(rewardPoolMock, rewardToken);
      await depositPool.setDistributor(newDistributor);

      expect(await depositToken.allowance(depositPool, distributorMock)).to.eq(0);
      expect(await depositToken.allowance(depositPool, newDistributor)).to.eq(MaxUint256);
    });
    it('should revert when the implementation is invalid', async () => {
      const invalidContract = await deployRewardPoolMock();
      await expect(depositPool.setDistributor(invalidContract)).to.be.revertedWith('DR: invalid distributor address');
    });
    it('should revert if caller is not owner', async () => {
      await expect(depositPool.connect(SECOND).setDistributor(OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#migrate', () => {
    it('should correctly migrate', async () => {
      // Prepare V5 conditions
      const distributionV5 = await deployDistributionV5(depositToken, OWNER);

      await depositToken.approve(distributionV5, wei(1000));
      await depositToken.connect(SECOND).approve(distributionV5, wei(1000));

      await distributionV5.connect(OWNER).createPool(getDefaultPool());
      await setNextTime(oneDay * 1);
      await distributionV5.connect(SECOND).stake(0, wei(1), 0, ZERO_ADDR);

      expect(await depositToken.balanceOf(distributionV5)).to.eq(wei(1));
      expect(await distributionV5.totalDepositedInPublicPools()).to.eq(wei(1));

      // Upgrade
      const lib1 = await (await ethers.getContractFactory('ReferrerLib')).deploy();
      const lib2 = await (await ethers.getContractFactory('LockMultiplierMath')).deploy();
      const newDepositPoolImplFactory = await ethers.getContractFactory('DepositPool', {
        libraries: { ReferrerLib: await lib1.getAddress(), LockMultiplierMath: await lib2.getAddress() },
      });
      const newDepositPoolImpl = await newDepositPoolImplFactory.deploy();
      await distributionV5.upgradeTo(newDepositPoolImpl);

      const newDepositPool = newDepositPoolImpl.attach(distributionV5) as DepositPool;

      expect(await newDepositPool.version()).to.eq(7);
      expect(await newDepositPool.getAddress()).to.eq(await distributionV5.getAddress());

      await newDepositPool.setDistributor(distributorMock);
      await distributorMock.addDepositPool(newDepositPool, depositToken, Strategy.NONE);

      await expect(newDepositPool.migrate(rewardPoolId)).to.be.revertedWith('DS: yield for token is zero');

      await depositToken.mint(newDepositPool, wei(2));
      expect(await depositToken.balanceOf(newDepositPool)).to.eq(wei(3));
      expect(await newDepositPool.totalDepositedInPublicPools()).to.eq(wei(1));

      await newDepositPool.migrate(0);

      expect(await depositToken.balanceOf(newDepositPool)).to.eq(wei(0));
      expect(await depositToken.balanceOf(distributorMock)).to.eq(wei(3));
      expect(await newDepositPool.totalDepositedInPublicPools()).to.eq(wei(1));
    });
    it('should revert when the migration is over', async () => {
      await depositPool.migrate(rewardPoolId);
      await expect(depositPool.migrate(rewardPoolId)).to.be.revertedWith('DS: the migration is over');
    });
    it('should revert if caller is not owner', async () => {
      await expect(depositPool.connect(SECOND).migrate(rewardPoolId)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setRewardPoolProtocolDetails', () => {
    it('should edit pool limits with correct data', async () => {
      await depositPool.setRewardPoolProtocolDetails(rewardPoolId, 1, 2, 3, 4);

      const rewardPoolProtocolDetails = await depositPool.rewardPoolsProtocolDetails(rewardPoolId);
      expect(rewardPoolProtocolDetails.withdrawLockPeriodAfterStake).to.be.eq(1);
      expect(rewardPoolProtocolDetails.claimLockPeriodAfterStake).to.be.eq(2);
      expect(rewardPoolProtocolDetails.claimLockPeriodAfterClaim).to.be.eq(3);
      expect(rewardPoolProtocolDetails.minimalStake).to.be.eq(4);
    });
    it('should revert if caller is not owner', async () => {
      await expect(
        depositPool.connect(SECOND).setRewardPoolProtocolDetails(rewardPoolId, 1, 2, 3, 4),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#manageUsersInPrivateRewardPool', () => {
    const rewardPoolId = 1;
    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
      await rewardPoolMock.setIsRewardPoolExist(rewardPoolId, true);
    });

    it('should correctly imitate stake and withdraw process', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await setNextTime(oneHour * 3);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(10), wei(1)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.eq(wei(10));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly calculate and withdraw rewards', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(0), wei(0)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(20), wei(0.001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(19.6), wei(0.001));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(78.4), wei(0.001));

      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
    });
    it('should correctly calculate rewards after partial stake', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      // Stake after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(5), wei(5)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(0), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(80));

      // Claim after 2 day
      await setNextTime(oneDay + oneDay * 2);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20 + 49));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80 + 49), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before depositPool start and claim after', async () => {
      let userData;

      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      await setNextTime(oneDay * 20000);
      await distributorMock.setDistributedRewardsAnswer(wei(2550));

      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(510));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(2040));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before depositPool end and claim after', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      await setNextTime(oneDay * 20000);
      await distributorMock.setDistributedRewardsAnswer(wei(650));

      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(130));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(520));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change after depositPool end', async () => {
      let userData;
      await setNextTime(oneDay * 20000);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(2), wei(5)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change both at and depositPool end', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      await distributorMock.setDistributedRewardsAnswer(wei(650));

      await setNextTime(oneDay * 20000);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(2), wei(5)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(130));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(520));
    });
    it('should correctly work if multiple changes in one block', async () => {
      let userData;

      await setNextTime(oneHour * 2);

      await ethers.provider.send('evm_setAutomine', [false]);

      const tx1 = depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );
      const tx2 = depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(2), wei(1)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );
      const tx3 = depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(10), wei(0)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );
      const tx4 = depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      await ethers.provider.send('evm_setAutomine', [true]);
      await ethers.provider.send('evm_mine', []);

      await expect(tx1).to.not.be.reverted;
      await expect(tx2).to.not.be.reverted;
      await expect(tx3).to.not.be.reverted;
      await expect(tx4).to.not.be.reverted;

      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(0), wei(0)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(39.6), wei(0.001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(158.4), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should handle deposited amount and claimLockEnd are the same', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay * 2);
      await depositPool.manageUsersInPrivateRewardPool(
        rewardPoolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
        [ZERO_ADDR, ZERO_ADDR],
      );

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(80));
    });

    describe('with provided claimLockEnd', () => {
      const periodStart = 1721908800;
      const claimLockEnd = periodStart + 300 * oneDay - 1;

      it('should correctly imitate stake and withdraw process', async () => {
        let userData, multiplier;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        await setNextTime((await getCurrentBlockTime()) + 1);
        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(10), wei(1)],
          [claimLockEnd, claimLockEnd],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(10));
        expect(userData.virtualDeposited).to.eq((wei(10) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly calculate and withdraw rewards', async () => {
        let userData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
          [ZERO_ADDR, ZERO_ADDR],
        );

        await setTime(claimLockEnd);
        await distributorMock.setDistributedRewardsAnswer(wei(4570722));

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(4570722 / 5), wei(0.001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei((4570722 * 4) / 5), wei(0.1));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should save claimLockEnd changes only', async () => {
        let userData, multiplier;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd * 2],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        await setNextTime(claimLockEnd + 1);
        await distributorMock.setDistributedRewardsAnswer(wei(4570722));

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd * 2, claimLockEnd * 2 + 200 * oneDay],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.lt(wei(4570722 / 5));
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.gt(wei((4570722 * 4) / 5));
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2 + 200 * oneDay);
        expect(userData.referrer).to.eq(ZERO_ADDR);
      });
      it('should set claimLockEnd properly if providing 0', async () => {
        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [ZERO_ADDR]);
        let userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [ZERO_ADDR]);
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address],
          [wei(1)],
          [claimLockEnd],
          [ZERO_ADDR],
        );
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.claimLockEnd).to.eq(claimLockEnd);

        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [ZERO_ADDR]);
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.claimLockEnd).to.eq(claimLockEnd);
      });
    });

    describe('with provided referrer', () => {
      const referrerTiers = getDefaultReferrerTiers();

      beforeEach(async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);
      });

      it('should correctly imitate stake and withdraw process', async () => {
        let userData, multiplier, referrerData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [0, 0],
          [REFERRER_1, REFERRER_2],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.eq(wei(1.01, 25));
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.eq(wei(1.01, 25));
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(4));
        expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        await setNextTime((await getCurrentBlockTime()) + 1);
        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(10), wei(1)],
          [0, 0],
          [REFERRER_1, REFERRER_2],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.eq(wei(1.01, 25));
        expect(userData.deposited).to.eq(wei(10));
        expect(userData.virtualDeposited).to.eq((wei(10) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(10));
        expect(referrerData.virtualAmountStaked).to.eq((wei(10) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.eq(wei(1.01, 25));
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);
      });
      it('should correctly calculate and withdraw rewards', async () => {
        let userData, referrerData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [0, 0],
          [REFERRER_1, REFERRER_2],
        );

        await setTime(oneDay * 2);
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
        const totalReward = wei(100);
        const secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        const ownerPart = 4n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
        const referrer1Part = 1n * BigInt(referrerTiers[0].multiplier);
        const referrer2Part = 4n * BigInt(referrerTiers[0].multiplier);
        const totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
        const rewardPerPart = (totalReward * PRECISION) / totalParts;

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
          (rewardPerPart * secondPart) / PRECISION,
          wei(0.001),
        );
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(
          (rewardPerPart * ownerPart) / PRECISION,
          wei(0.1),
        );
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4.04));
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(4));
        expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);
      });
      it('should save referrer changes only', async () => {
        let userData, multiplier, referrerData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [0, 0],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        await setNextTime(oneDay * 2);
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [0, 0],
          [REFERRER_1, REFERRER_2],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.lt(wei(4570722 / 5));
        expect(userData.referrer).to.eq(REFERRER_1);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.gt(0);
        expect(userData.referrer).to.eq(REFERRER_2);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(4));
        expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);
      });
      it('should set referrer properly if providing zero address', async () => {
        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [ZERO_ADDR]);
        let userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.referrer).to.eq(ZERO_ADDR);

        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [REFERRER_1]);
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.referrer).to.eq(REFERRER_1);

        await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [wei(1)], [0], [ZERO_ADDR]);
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.referrer).to.eq(REFERRER_1);
      });
    });

    describe('with provided claimLockEnd and referrer', () => {
      const periodStart = 1721908800;
      const claimLockEnd = periodStart + 300 * oneDay - 1;
      const referrerTiers = getDefaultReferrerTiers();

      beforeEach(async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);
      });

      it('should correctly imitate stake and withdraw process', async () => {
        let userData, multiplier, referrerData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
          [REFERRER_1, REFERRER_2],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(4));
        expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        await setNextTime((await getCurrentBlockTime()) + 1);
        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(10), wei(1)],
          [claimLockEnd, claimLockEnd],
          [ZERO_ADDR, ZERO_ADDR],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(10));
        expect(userData.virtualDeposited).to.eq((wei(10) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(10));
        expect(referrerData.virtualAmountStaked).to.eq((wei(10) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);
      });
      it('should correctly calculate and withdraw rewards', async () => {
        let userData, referrerData;

        await depositPool.manageUsersInPrivateRewardPool(
          rewardPoolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
          [REFERRER_1, REFERRER_2],
        );

        const totalReward = wei(4570722);
        const secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        const ownerPart = 4n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
        const referrer1Part = 1n * BigInt(referrerTiers[0].multiplier);
        const referrer2Part = 4n * BigInt(referrerTiers[0].multiplier);
        const totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
        const rewardPerPart = (totalReward * PRECISION) / totalParts;

        await setTime(claimLockEnd);
        await distributorMock.setDistributedRewardsAnswer(wei(4570722));

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
          (rewardPerPart * secondPart) / PRECISION,
          wei(0.001),
        );
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(
          (rewardPerPart * ownerPart) / PRECISION,
          wei(0.1),
        );
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4.04));
        expect(userData.pendingRewards).to.eq(0);
        referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(4));
        expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
        expect(referrerData.pendingRewards).to.eq(0);
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(
        depositPool.connect(SECOND).manageUsersInPrivateRewardPool(rewardPoolId, [], [], [], []),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert if lengths of arrays are not equal', async () => {
      await expect(
        depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [SECOND.address], [], [], []),
      ).to.be.revertedWith('DS: invalid length');

      await expect(depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [], [wei(1)], [], [])).to.be.revertedWith(
        'DS: invalid length',
      );

      await expect(depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [], [], [0], [])).to.be.revertedWith(
        'DS: invalid length',
      );

      await expect(
        depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [], [], [], [ZERO_ADDR]),
      ).to.be.revertedWith('DS: invalid length');
    });
  });

  describe('#setClaimSender', () => {
    it('should correctly set and skip the claim sender', async () => {
      expect(await depositPool.claimSender(rewardPoolId, OWNER, SECOND)).to.be.eq(false);
      await depositPool.setClaimSender(rewardPoolId, [SECOND], [true]);
      expect(await depositPool.claimSender(rewardPoolId, OWNER, SECOND)).to.be.eq(true);
      await depositPool.setClaimSender(rewardPoolId, [SECOND], [false]);
      expect(await depositPool.claimSender(rewardPoolId, OWNER, SECOND)).to.be.eq(false);
    });
    it('should revert if invalid array length', async () => {
      await expect(depositPool.setClaimSender(rewardPoolId, [SECOND], [true, false])).to.be.revertedWith(
        'DS: invalid array length',
      );
    });
  });

  describe('#setClaimReceiver', () => {
    it('should correctly set and skip the claim receiver', async () => {
      expect(await depositPool.claimReceiver(rewardPoolId, OWNER)).to.be.eq(ZERO_ADDR);
      await depositPool.setClaimReceiver(rewardPoolId, SECOND);
      expect(await depositPool.claimReceiver(rewardPoolId, OWNER)).to.be.eq(SECOND);
      await depositPool.setClaimReceiver(rewardPoolId, ZERO_ADDR);
      expect(await depositPool.claimReceiver(rewardPoolId, OWNER)).to.be.eq(ZERO_ADDR);
    });
  });

  describe('#stake', () => {
    before(async () => {
      await expect(depositPool.stake(rewardPoolId, 0, 0, ZERO_ADDR)).to.be.revertedWith("DS: migration isn't over");
    });

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
    });

    it('should stake correctly', async () => {
      // A stakes 1 token
      await setNextTime(oneDay * 1);
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(oneDay);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      expect(userData.referrer).to.eq(ZERO_ADDR);
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(3), 0, ZERO_ADDR);
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      expect(userData.claimLockStart).to.eq(oneDay * 2);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      expect(userData.referrer).to.eq(ZERO_ADDR);
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(4));
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(4));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(198));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(8), 0, ZERO_ADDR);
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(wei(8));
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(oneDay * 3);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      expect(userData.referrer).to.eq(ZERO_ADDR);
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(12));
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it('should stake with lock correctly', async () => {
      const claimLockEnd = oneDay * 10;

      // A stakes 1 token
      await depositPool.stake(rewardPoolId, wei(1), claimLockEnd, ZERO_ADDR);
      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.referrer).to.eq(ZERO_ADDR);
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(3), claimLockEnd, ZERO_ADDR);
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION,
      );
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.referrer).to.eq(ZERO_ADDR);
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION,
      );
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(4));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(198));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(8), claimLockEnd, ZERO_ADDR);
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(
        (wei(8) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND))) / PRECISION,
      );
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.referrer).to.eq(ZERO_ADDR);
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION +
          (wei(8) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND))) / PRECISION,
      );
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it('should stake with referrer correctly', async () => {
      const referrerTiers = getDefaultReferrerTiers();
      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      // A stakes 1 token
      await depositPool.stake(rewardPoolId, wei(1), 0, REFERRER_1);

      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1.01));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.referrer).to.eq(REFERRER_1);
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1.02));
      expect(poolData.rate).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));
      let referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(1));
      expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // A stakes 3 tokens
      await setNextTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(3), 0, REFERRER_1);

      let totalReward = wei(100);
      let secondPart = 0n;
      const ownerPart = 4n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
      const referrer1Part = 4n * BigInt(referrerTiers[0].multiplier);
      let referrer2Part = 0n;
      let totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
      let rewardPerPart = (totalReward * PRECISION) / totalParts;

      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION,
      );
      expect(userData.rate).to.closeTo(wei(98, 25), wei(0.1, 25));
      expect(userData.pendingRewards).to.closeTo((rewardPerPart * ownerPart) / PRECISION, wei(0.0001));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.referrer).to.eq(REFERRER_1);
      referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(4));
      expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.be.closeTo((rewardPerPart * referrer1Part) / PRECISION, wei(0.0001));

      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION + (wei(4) * 1n) / 100n,
      );
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(4));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(198));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(8), 0, REFERRER_2);

      totalReward = wei(198);
      secondPart = 8n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
      referrer2Part = 8n * BigInt(referrerTiers[0].multiplier);
      totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
      rewardPerPart = (totalReward * PRECISION) / totalParts;

      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(wei(secondPart) / PRECISION);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.referrer).to.eq(REFERRER_2);
      referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(8));
      expect(referrerData.virtualAmountStaked).to.eq(wei(referrer2Part) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(totalParts) / PRECISION);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it('should stake with lock and referrer correctly', async () => {
      const referrerTiers = getDefaultReferrerTiers();
      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      const claimLockEnd = oneDay * 10;
      // A stakes 1 token
      await depositPool.stake(rewardPoolId, wei(1), claimLockEnd, REFERRER_1);

      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1.01));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.referrer).to.eq(REFERRER_1);
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1.02));
      expect(poolData.rate).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));
      let referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(1));
      expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // A stakes 3 tokens
      await setNextTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(3), claimLockEnd, REFERRER_1);

      let totalReward = wei(100);
      let secondPart = 0n;
      const ownerPart = 4n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
      const referrer1Part = 4n * BigInt(referrerTiers[0].multiplier);
      let referrer2Part = 0n;
      let totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
      let rewardPerPart = (totalReward * PRECISION) / totalParts;

      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION,
      );
      expect(userData.rate).to.closeTo(wei(98, 25), wei(0.1, 25));
      expect(userData.pendingRewards).to.closeTo((rewardPerPart * ownerPart) / PRECISION, wei(0.0001));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.referrer).to.eq(REFERRER_1);
      referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(4));
      expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.be.closeTo((rewardPerPart * referrer1Part) / PRECISION, wei(0.0001));

      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER))) / PRECISION + (wei(4) * 1n) / 100n,
      );
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(4));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(198));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(8), claimLockEnd, REFERRER_2);

      totalReward = wei(198);
      secondPart = 8n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
      referrer2Part = 8n * BigInt(referrerTiers[0].multiplier);
      totalParts = secondPart + ownerPart + referrer1Part + referrer2Part;
      rewardPerPart = (totalReward * PRECISION) / totalParts;

      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(wei(secondPart) / PRECISION);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.referrer).to.eq(REFERRER_2);
      referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(8));
      expect(referrerData.virtualAmountStaked).to.eq(wei(referrer2Part) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(totalParts) / PRECISION);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it('should change referrer correctly', async () => {
      const referrerTiers = getDefaultReferrerTiers();
      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      // A stakes 1 token for referrer 1
      await depositPool.stake(rewardPoolId, wei(1), 0, REFERRER_1);

      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1.01));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.referrer).to.eq(REFERRER_1);
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1.02));
      expect(poolData.rate).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));
      let referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(1));
      expect(referrerData.virtualAmountStaked).to.eq((wei(1) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // A stakes 3 tokens for referrer 2
      await setNextTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(3), 0, REFERRER_2);

      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4.04));
      expect(userData.referrer).to.eq(REFERRER_2);
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(4.08));
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(4));
      referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(4));
      expect(referrerData.virtualAmountStaked).to.eq((wei(4) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(referrerData.pendingRewards).to.eq(0);

      const oldReferrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(oldReferrerData.amountStaked).to.eq(wei(0));
      expect(oldReferrerData.virtualAmountStaked).to.eq((wei(0) * BigInt(referrerTiers[0].multiplier)) / PRECISION);
      expect(oldReferrerData.pendingRewards).to.closeTo((wei(100) * 1n) / 102n, wei(0.0001));
    });
    it('should change total virtual amount correctly', async () => {
      let previousTotalDeposited = 0n;

      const referrerTiers = getDefaultReferrerTiers();
      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      // A stakes 100 token from OWNER for referrer 1
      await depositPool.stake(rewardPoolId, wei(100), 0, REFERRER_1);

      let userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(100));
      expect(userData.virtualDeposited).to.eq(wei(100 * 1.01));
      expect(userData.referrer).to.eq(REFERRER_1);
      let referrerData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(100));
      expect(referrerData.virtualAmountStaked).to.eq(wei(100 * 0.025));
      let poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.totalVirtualDeposited).to.closeTo(wei(100 * (1 + 0.01 + 0.025)), wei(0.000001));
      previousTotalDeposited = wei(100 * (1 + 0.01 + 0.025));

      // A stakes 200 token from SECOND for referrer 2
      await setNextTime(oneDay * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(200), 0, REFERRER_2);

      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(200));
      expect(userData.virtualDeposited).to.eq(wei(200 * 1.01));
      expect(userData.referrer).to.eq(REFERRER_2);
      referrerData = await depositPool.referrersData(REFERRER_2, rewardPoolId);
      expect(referrerData.amountStaked).to.eq(wei(200));
      expect(referrerData.virtualAmountStaked).to.eq(wei(200 * 0.025));
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.totalVirtualDeposited).to.closeTo(
        previousTotalDeposited + wei(200 * (1 + 0.01 + 0.025)),
        wei(0.000001),
      );
      previousTotalDeposited = previousTotalDeposited + wei(200 * (1 + 0.01 + 0.025));

      // Stakes 10 tokens from SECOND for referrer 1, move stake from referrer 2 to 1
      await setNextTime(oneDay * 3);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(10), 0, REFERRER_1);

      const userDataSecond = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userDataSecond.deposited).to.eq(wei(210));
      expect(userDataSecond.virtualDeposited).to.eq(wei(210 * 1.01));
      expect(userDataSecond.referrer).to.eq(REFERRER_1);
      const userDataOwner = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userDataOwner.deposited).to.eq(wei(100));
      expect(userDataOwner.virtualDeposited).to.eq(wei(100 * 1.01));
      expect(userDataOwner.referrer).to.eq(REFERRER_1);
      const referrerData1 = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referrerData1.amountStaked).to.eq(wei(310));
      expect(referrerData1.virtualAmountStaked).to.eq(wei(100 * 0.025) + wei(210 * 0.025));
      const referrerData2 = await depositPool.referrersData(REFERRER_2, rewardPoolId);
      expect(referrerData2.amountStaked).to.eq(wei(0));
      expect(referrerData2.virtualAmountStaked).to.eq(wei(0));
      poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.totalVirtualDeposited).to.closeTo(
        wei(100 * (1 + 0.01 + 0.025)) + wei(210 * (1 + 0.01 + 0.025)),
        wei(0.000001),
      );
    });
    it('should revert if amount is less than minimal stake', async () => {
      await depositPool.setRewardPoolProtocolDetails(rewardPoolId, 1, 1, 1, wei(999));
      await expect(depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR)).to.be.revertedWith('DS: amount too low');
    });
    it('should revert if amount is equal zero', async () => {
      await expect(depositPool.stake(rewardPoolId, 0, 0, ZERO_ADDR)).to.be.revertedWith('DS: nothing to stake');
    });
    it('should revert if claimLockEnd is less than previous one', async () => {
      await depositPool.stake(rewardPoolId, wei(1), 2 * oneDay, ZERO_ADDR);

      await expect(depositPool.stake(rewardPoolId, wei(1), oneDay, ZERO_ADDR)).to.be.revertedWith(
        'DS: invalid claim lock end',
      );
    });
  });

  describe('#claim', () => {
    before(async () => {
      await expect(depositPool.claim(rewardPoolId, SECOND)).to.be.revertedWith("DS: migration isn't over");
    });

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
    });

    it('should correctly claim, one user, without redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(198));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(198));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(294));

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(294));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(570));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(570));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      // Deposit 1 day after the start of reward payment
      await setNextTime(oneDay + oneDay);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(100));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(149));

      // Claim after 1.5 days
      await setNextTime(oneDay + oneDay * 1.5);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      // Deposit 4 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(239));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90 / 4));

      // Claim after 5.25 days
      await setNextTime(oneDay + oneDay * 5.25);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(149 + 353.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      await setNextTime(oneDay + oneDay);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(98));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(98));
      const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, without redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72), wei(0.01));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72 + 207), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24 + 69), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 / 2));

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(2), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92));

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(4), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90 + 88));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 / 2));

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(2), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92));

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(4), 0, ZERO_ADDR);

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90 + 88));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim zero reward when poll reward is zero', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly continue claim reward after pool stop (zero reward)', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 94));

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 70.5), wei(0.01));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 23.5), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim for receiver', async () => {
      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(SECOND).claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(198));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    describe('#claimFor', () => {
      beforeEach(async () => {
        await setNextTime(oneHour * 2);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

        // Deposit 1 day after the start of reward payment
        await setNextTime(oneDay + oneDay);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 / 2));
      });
      it('should correctly claim, with `claimSender` without `claimReceiver`', async () => {
        await depositPool.connect(SECOND).setClaimSender(rewardPoolId, [OWNER], [true]);
        // Claim after 1.5 days
        await setNextTime(oneDay + oneDay * 1.5);
        await depositPool.connect(OWNER).claimFor(rewardPoolId, SECOND, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
        const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq(wei(2));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, without `claimSender` and with `claimReceiver`', async () => {
        await depositPool.connect(SECOND).setClaimReceiver(rewardPoolId, REFERRER_1);

        // Claim after 1.5 days
        await setNextTime(oneDay + oneDay * 1.5);
        await depositPool.connect(OWNER).claimFor(rewardPoolId, SECOND, ZERO_ADDR, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(REFERRER_1.address)).to.eq(wei(149));
        const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq(wei(2));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should revert if invalid caller', async () => {
        await expect(
          depositPool.connect(OWNER).claimFor(rewardPoolId, SECOND, OWNER, { value: wei(0.5) }),
        ).to.be.revertedWith('DS: invalid caller');
      });
    });
    describe('with multiplier', () => {
      const periodStart = 1721908800;
      const claimLockEnd = periodStart + 300 * oneDay - 1;

      it('should correctly claim, one user, without redeposits', async () => {
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

        await setNextTime(periodStart + oneDay / 2);
        await depositPool.connect(SECOND).lockClaim(rewardPoolId, claimLockEnd);

        const multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(4570722));

        await setTime(claimLockEnd);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(4570722), wei(0.000001));
        const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, with redeposits', async () => {
        let userData;

        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);
        await depositPool.connect(SECOND).lockClaim(rewardPoolId, claimLockEnd);

        await setNextTime(periodStart + oneDay);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), claimLockEnd, ZERO_ADDR);

        let multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(4570722));

        await setTime(claimLockEnd);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

        multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(4570722), wei(0.000001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq(wei(2));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, join after start', async () => {
        await setNextTime(periodStart + oneDay);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

        await depositPool.connect(SECOND).lockClaim(rewardPoolId, claimLockEnd);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(2894918));

        await setTime(claimLockEnd);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(2894918), wei(0.000001));
        const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, few users, without redeposits', async () => {
        let userData;

        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);
        await depositPool.connect(SECOND).lockClaim(rewardPoolId, claimLockEnd);

        await setNextTime(periodStart);
        await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);
        await depositPool.connect(OWNER).lockClaim(rewardPoolId, claimLockEnd);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(2904750));

        await setTime(claimLockEnd);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(2904750 * 0.75), wei(0.1));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(2904750 * 0.25), wei(0.1));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
    });
    describe('with referrer', () => {
      const referrerTiers = getDefaultReferrerTiers();

      beforeEach(async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);
      });

      it('should correctly claim, one user, without redeposits', async () => {
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);

        const userMultiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userMultiplier).to.equal(wei(1.01, 25));

        const referrerMultiplier = await depositPool.getReferrerMultiplier(rewardPoolId, OWNER);
        expect(referrerMultiplier).to.equal(wei(0.01, 25));

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        await setNextTime(oneDay + oneDay);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei((100 * 101) / 102), wei(0.000001));
        const userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);
        const referrerData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referrerData.amountStaked).to.eq(wei(1));
        expect(referrerData.virtualAmountStaked).to.eq(wei(0.01));
        expect(referrerData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, with redeposits', async () => {
        let userData, referralData;

        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(50));

        await setNextTime(oneDay + oneDay / 2);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);

        const userMultiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND);
        expect(userMultiplier).to.equal(wei(1.01, 25));

        const referrerMultiplier = await depositPool.getReferrerMultiplier(rewardPoolId, OWNER);
        expect(referrerMultiplier).to.equal(wei(0.01, 25));

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100));
        await setNextTime(oneDay + oneDay);

        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq((wei(2) * userMultiplier) / PRECISION);
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(2));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.02));
        expect(referralData.pendingRewards).to.be.closeTo(wei((50 * 1) / 102), wei(0.000001));

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei((100 * 101) / 102), wei(0.000001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq(wei(2.02));
        expect(userData.pendingRewards).to.eq(0);
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(2));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.02));
        expect(referralData.pendingRewards).to.be.closeTo(wei((50 * 1) / 102), wei(0.000001));
      });
      it('should correctly claim, few users, without redeposits', async () => {
        let userData, referralData;

        await setNextTime(oneHour * 2);
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        await setNextTime(oneDay + oneDay);

        let newReward = wei(100);
        let secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        let ownerPart = 0n;
        let referrerPart = 1n * BigInt(referrerTiers[0].multiplier);
        let totalParts = secondPart + ownerPart + referrerPart;
        let rewardPerPart = (newReward * PRECISION) / totalParts;
        let ownerAmount = (rewardPerPart * ownerPart) / PRECISION;
        let secondAmount = (rewardPerPart * secondPart) / PRECISION;
        let referrerAmount = (rewardPerPart * referrerPart) / PRECISION;

        // Claim after 1 days
        await ethers.provider.send('evm_setAutomine', [false]);
        await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, OWNER);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claimReferrerTier(rewardPoolId, REFERRER_1, { value: wei(0.5) });
        await ethers.provider.send('evm_setAutomine', [true]);
        await ethers.provider.send('evm_mine');

        expect(await rewardToken.balanceOf(OWNER.address)).to.equal(0);
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3.03));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(secondAmount, wei(0.0001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(REFERRER_1.address)).to.closeTo(referrerAmount, wei(0.0001));
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(4));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.04));
        expect(referralData.pendingRewards).to.eq(0);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

        // Claim after 2 days
        await setNextTime(oneDay + oneDay * 2);

        await ethers.provider.send('evm_setAutomine', [false]);
        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
        await depositPool.claimReferrerTier(rewardPoolId, REFERRER_1, { value: wei(0.5) });
        await ethers.provider.send('evm_setAutomine', [true]);
        await ethers.provider.send('evm_mine');

        newReward = wei(98);
        secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        ownerPart = 3n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
        referrerPart = 4n * BigInt(referrerTiers[0].multiplier);
        totalParts = secondPart + ownerPart + referrerPart;
        rewardPerPart = (newReward * PRECISION) / totalParts;
        ownerAmount += (rewardPerPart * ownerPart) / PRECISION;
        secondAmount += (rewardPerPart * secondPart) / PRECISION;
        referrerAmount += (rewardPerPart * referrerPart) / PRECISION;

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(ownerAmount, wei(0.01));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3.03));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(secondAmount, wei(0.0001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(REFERRER_1.address)).to.closeTo(referrerAmount, wei(0.0001));
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(4));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.04));
        expect(referralData.pendingRewards).to.eq(0);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

        // Claim after 3 day
        await setNextTime(oneDay + oneDay * 3);

        newReward = wei(96);
        secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        ownerPart = 3n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
        referrerPart = 4n * BigInt(referrerTiers[0].multiplier);
        totalParts = secondPart + ownerPart + referrerPart;
        rewardPerPart = (newReward * PRECISION) / totalParts;
        ownerAmount += (rewardPerPart * ownerPart) / PRECISION;
        secondAmount += (rewardPerPart * secondPart) / PRECISION;
        referrerAmount += (rewardPerPart * referrerPart) / PRECISION;

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
        await depositPool.claimReferrerTier(rewardPoolId, REFERRER_1, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(ownerAmount, wei(0.001));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3.03));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(secondAmount, wei(0.001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(REFERRER_1.address)).to.closeTo(referrerAmount, wei(0.001));
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(4));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.04));
        expect(referralData.pendingRewards).to.eq(0);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90));

        // Claim after 6 days
        await setNextTime(oneDay + oneDay * 6);

        newReward = wei(276);
        secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        ownerPart = 3n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER));
        referrerPart = 4n * BigInt(referrerTiers[0].multiplier);
        totalParts = secondPart + ownerPart + referrerPart;
        rewardPerPart = (newReward * PRECISION) / totalParts;
        ownerAmount += (rewardPerPart * ownerPart) / PRECISION;
        secondAmount += (rewardPerPart * secondPart) / PRECISION;
        referrerAmount += (rewardPerPart * referrerPart) / PRECISION;

        await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
        await depositPool.claimReferrerTier(rewardPoolId, REFERRER_1, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(ownerAmount, wei(0.001));
        userData = await depositPool.usersData(OWNER.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3.03));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(secondAmount, wei(0.001));
        userData = await depositPool.usersData(SECOND.address, rewardPoolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1.01));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(REFERRER_1.address)).to.closeTo(referrerAmount, wei(0.001));
        referralData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referralData.amountStaked).to.eq(wei(4));
        expect(referralData.virtualAmountStaked).to.eq(wei(0.04));
        expect(referralData.pendingRewards).to.eq(0);
      });
    });
    it('should revert if claim caller is invalid', async () => {
      await expect(depositPool.claimFor(rewardPoolId, OWNER, OWNER)).to.be.revertedWith('DS: invalid caller');
    });
    it("should revert if `claimLockPeriodAfterStake` didn't pass", async () => {
      await setTime(oneDay + oneDay);
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);
      await depositPool.setRewardPoolProtocolDetails(rewardPoolId, 1, 999999, 3, 4);

      await expect(depositPool.claim(rewardPoolId, OWNER)).to.be.revertedWith('DS: pool claim is locked (S)');
    });
    it("should revert if `claimLockPeriodAfterClaim` didn't pass", async () => {
      await depositPool.setRewardPoolProtocolDetails(rewardPoolId, 1, 0, 60, 4);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      await setTime(oneDay * 2);
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      await setTime(oneDay * 3);
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
      await expect(depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) })).to.be.revertedWith(
        'DS: pool claim is locked (C)',
      );

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 1));

      await setTime(oneDay * 3 + 61);
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
    });
    it('should revert if nothing to claim', async () => {
      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      await setNextTime(oneDay + oneDay);
      await expect(depositPool.connect(SECOND).claim(rewardPoolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
    });
    it('should revert if personal claim is locked', async () => {
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);
      await depositPool.lockClaim(rewardPoolId, oneDay + oneDay);

      await setNextTime(oneDay + oneDay);
      await expect(depositPool.claim(rewardPoolId, OWNER)).to.be.revertedWith('DS: user claim is locked');
    });
  });

  describe('#withdraw', () => {
    before(async () => {
      await expect(depositPool.withdraw(rewardPoolId, 1)).to.be.revertedWith("DS: migration isn't over");
    });

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
      await depositPool.setRewardPoolProtocolDetails(rewardPoolId, oneDay - 1, 1, 2, wei(0.1));
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(OWNER).withdraw(rewardPoolId, wei(999));
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(1));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.000001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await depositPool.connect(SECOND).withdraw(rewardPoolId, wei(999));
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96 + 94), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(0));

      await setNextTime(oneDay + oneDay * 4 + 100);
      await expect(depositPool.claim(rewardPoolId, OWNER)).to.be.revertedWith('DS: nothing to claim');
      await expect(depositPool.connect(SECOND).claim(rewardPoolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
    });
    it('should correctly withdraw, few users, withdraw part', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(4), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.connect(OWNER).stake(rewardPoolId, wei(6), 0, ZERO_ADDR);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPool.connect(OWNER).withdraw(rewardPoolId, wei(2));
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000 - 6 + 2));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8 + 48), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48), wei(0.000001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await depositPool.connect(SECOND).withdraw(rewardPoolId, wei(2));
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000 - 4 + 2));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48 + 47), wei(0.001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92));

      // Claim after 5 days
      await setNextTime(oneDay + oneDay * 5);
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8 + 48 + 47 + 61.33333), wei(0.001));
      userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48 + 47 + 30.66666), wei(0.001));
      userData = await depositPool.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly modify referral rewards after withdraw', async () => {
      const referrerTiers = getDefaultReferrerTiers();
      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      await depositPool.stake(rewardPoolId, wei(10), 0, REFERRER_1);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPool.withdraw(rewardPoolId, wei(5));
      const userData = await depositPool.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.closeTo(wei(99), wei(0.1));
      const referralData = await depositPool.referrersData(REFERRER_1, rewardPoolId);
      expect(referralData.amountStaked).to.eq(wei(5));
      expect(referralData.virtualAmountStaked).to.eq(wei(5 * 0.01));
      expect(referralData.pendingRewards).to.closeTo(wei(1), wei(0.1));
      expect(referralData.rate).to.eq(userData.rate);
    });
    it('should correctly withdraw, few users, withdraw all, Aave pool', async () => {
      const usdc = await deployERC20Token();
      const aUsdc = await deployERC20Token();

      const depositPoolUsdc = await deployDepositPool(usdc, distributorMock);

      await usdc.mint(OWNER.address, wei(1000));
      await usdc.mint(SECOND.address, wei(1000));
      await usdc.connect(OWNER).approve(depositPoolUsdc, wei(1000));
      await usdc.connect(SECOND).approve(depositPoolUsdc, wei(1000));

      const aavePoolDataProviderMock = await deployAavePoolDataProviderMock();
      await aavePoolDataProviderMock.setATokenAddress(usdc, aUsdc);
      const aavePoolMock = await deployAavePoolMock(aavePoolDataProviderMock);

      await distributorMock.setAavePoolMock(aavePoolMock);
      await distributorMock.addDepositPool(depositPoolUsdc, usdc, Strategy.AAVE);

      await depositPoolUsdc.migrate(0);

      let userData;

      await setNextTime(oneHour * 2);
      await depositPoolUsdc.connect(SECOND).stake(rewardPoolId, wei(1), 0, ZERO_ADDR);
      expect(await usdc.balanceOf(distributorMock)).to.eq(wei(0));
      expect(await aUsdc.balanceOf(distributorMock)).to.greaterThan(wei(0));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await setNextTime(oneDay + oneDay);
      await depositPoolUsdc.connect(OWNER).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);
      expect(await usdc.balanceOf(distributorMock)).to.eq(wei(0));
      expect(await aUsdc.balanceOf(distributorMock)).to.greaterThan(wei(0));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await depositPoolUsdc.connect(OWNER).withdraw(rewardPoolId, wei(999));
      await depositPoolUsdc.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await depositPoolUsdc.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await depositPoolUsdc.totalDepositedInPublicPools()).to.eq(wei(1));

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await depositPoolUsdc.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.000001));
      userData = await depositPoolUsdc.usersData(OWNER.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96), wei(0.000001));
      userData = await depositPoolUsdc.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await depositPoolUsdc.connect(SECOND).withdraw(rewardPoolId, wei(999));
      await depositPoolUsdc.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96 + 94), wei(0.000001));
      userData = await depositPoolUsdc.usersData(SECOND.address, rewardPoolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await depositPoolUsdc.totalDepositedInPublicPools()).to.eq(wei(0));

      await setNextTime(oneDay + oneDay * 4 + 100);
      await expect(depositPoolUsdc.claim(rewardPoolId, OWNER)).to.be.revertedWith('DS: nothing to claim');
      await expect(depositPoolUsdc.connect(SECOND).claim(rewardPoolId, SECOND)).to.be.revertedWith(
        'DS: nothing to claim',
      );
    });
    it('should revert if trying to withdraw zero', async () => {
      await setNextTime(oneDay);
      await depositPool.stake(rewardPoolId, wei(10), 0, ZERO_ADDR);

      await setNextTime(oneDay * 3);
      await expect(depositPool.withdraw(rewardPoolId, 0)).to.be.revertedWith('DS: nothing to withdraw');
    });
    it("should revert if user didn't stake", async () => {
      await expect(depositPool.withdraw(rewardPoolId, 1)).to.be.revertedWith("DS: user isn't staked");
    });
    it("should revert if `minimalStake` didn't pass", async () => {
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      await setNextTime(oneDay + oneDay * 2);

      await expect(depositPool.withdraw(rewardPoolId, wei(0.99))).to.be.revertedWith('DS: invalid withdraw amount');
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      await setNextTime(oneDay);

      await expect(depositPool.withdraw(rewardPoolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
    it("should revert if `withdrawLockPeriodAfterStake didn't pass", async () => {
      await setNextTime(oneDay * 10);

      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      await expect(depositPool.withdraw(rewardPoolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
  });

  describe('#lockClaim', () => {
    const periodStart = 1721908800;
    const claimLockEnd = periodStart + 300 * oneDay;

    before(async () => {
      await expect(depositPool.lockClaim(rewardPoolId, claimLockEnd)).to.be.revertedWith("DS: migration isn't over");
    });

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should lock claim correctly in the public pool', async () => {
      await depositPool.stake(rewardPoolId, wei(10), 0, ZERO_ADDR);

      const initialTime = await getCurrentBlockTime();

      let userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

      await setNextTime(periodStart + oneDay);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await depositPool.lockClaim(rewardPoolId, claimLockEnd);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.gt(wei(10));
      expect(userData.rate).to.gt(0);
      expect(userData.pendingRewards).to.gt(0);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.referrer).to.eq(ZERO_ADDR);

      const poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.gt(wei(1));
      expect(poolData.rate).to.gt(0);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(10));

      await setTime(claimLockEnd);

      await depositPool.lockClaim(rewardPoolId, claimLockEnd * 2);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

      await setTime(claimLockEnd * 2);
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      await depositPool.lockClaim(rewardPoolId, claimLockEnd * 3);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 3);
    });
    it('should lock claim correctly in the private pool', async () => {
      const rewardPoolId = 1;

      await rewardPoolMock.setIsRewardPoolExist(rewardPoolId, true);

      await depositPool.manageUsersInPrivateRewardPool(rewardPoolId, [OWNER], [wei(10)], [0], [ZERO_ADDR]);

      const initialTime = await getCurrentBlockTime();

      let userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

      await setNextTime(periodStart + oneDay);

      // Add rewards
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await depositPool.lockClaim(rewardPoolId, claimLockEnd);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.gt(wei(10));
      expect(userData.rate).to.gt(0);
      expect(userData.pendingRewards).to.gt(0);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      expect(userData.referrer).to.eq(ZERO_ADDR);

      const poolData = await depositPool.rewardPoolsData(rewardPoolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.gt(wei(1));
      expect(poolData.rate).to.gt(0);

      await setTime(claimLockEnd);

      await depositPool.lockClaim(rewardPoolId, claimLockEnd * 2);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

      await setTime(claimLockEnd * 2);
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      await depositPool.lockClaim(rewardPoolId, claimLockEnd * 3);
      userData = await depositPool.usersData(OWNER, rewardPoolId);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 3);
    });
    it('should revert if claimLockEnd < block.timestamp', async () => {
      await depositPool.stake(rewardPoolId, wei(10), 0, ZERO_ADDR);

      await setNextTime(periodStart + oneDay);

      await expect(depositPool.lockClaim(rewardPoolId, periodStart - 1)).to.be.revertedWith(
        'DS: invalid lock end value (1)',
      );
    });
    it('should revert if claimLockEnd less then previous lock end', async () => {
      await depositPool.stake(rewardPoolId, wei(10), claimLockEnd, ZERO_ADDR);

      await expect(depositPool.lockClaim(rewardPoolId, claimLockEnd - 1)).to.be.revertedWith(
        'DS: invalid lock end value (2)',
      );
    });
    it('should revert if user is not staked', async () => {
      await expect(depositPool.lockClaim(rewardPoolId, (await getCurrentBlockTime()) + 2)).to.be.revertedWith(
        "DS: user isn't staked",
      );
    });
  });

  describe('referral system', () => {
    const referrerTiers = getDefaultReferrerTiers();

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
    });

    describe('#editReferrerTiers', () => {
      it('should edit referrer tiers with correct data', async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

        for (let i = 0; i < referrerTiers.length; i++) {
          expect(referrerTiers[i].amount.toString()).to.eq((await depositPool.referrerTiers(rewardPoolId, i)).amount);
          expect(referrerTiers[i].multiplier.toString()).to.eq(
            (await depositPool.referrerTiers(rewardPoolId, i)).multiplier,
          );
        }

        await expect(depositPool.referrerTiers(rewardPoolId, referrerTiers.length)).to.be.revertedWithoutReason();
      });
      it('should edit already created referrer tiers with correct data', async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

        const newReferrerTiers = [referrerTiers[0]];
        await depositPool.editReferrerTiers(rewardPoolId, newReferrerTiers);

        for (let i = 0; i < newReferrerTiers.length; i++) {
          expect(newReferrerTiers[i].amount.toString()).to.eq(
            (await depositPool.referrerTiers(rewardPoolId, i)).amount,
          );
          expect(newReferrerTiers[i].multiplier.toString()).to.eq(
            (await depositPool.referrerTiers(rewardPoolId, i)).multiplier,
          );
        }
        await expect(depositPool.referrerTiers(rewardPoolId, referrerTiers.length)).to.be.revertedWithoutReason();
      });
      it('should revert if caller is not owner', async () => {
        await expect(depositPool.connect(SECOND).editReferrerTiers(rewardPoolId, referrerTiers)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
      it('should not revert if referrer tiers are empty', async () => {
        await depositPool.editReferrerTiers(rewardPoolId, []);
      });
      it('should revert if referrer tiers are not sorted by amount', async () => {
        const newReferrerTiers = [
          { amount: 1, multiplier: wei(1, 25) },
          { amount: 0, multiplier: wei(2, 25) },
        ];

        await expect(depositPool.editReferrerTiers(rewardPoolId, newReferrerTiers)).to.be.revertedWith(
          'DS: invalid referrer tiers (1)',
        );
      });
      it('should revert if referrer tiers are not sorted by multiplier', async () => {
        const newReferrerTiers = [
          { amount: 0, multiplier: wei(2, 25) },
          { amount: 1, multiplier: wei(1, 25) },
        ];
        await expect(depositPool.editReferrerTiers(rewardPoolId, newReferrerTiers)).to.be.revertedWith(
          'DS: invalid referrer tiers (2)',
        );
      });
    });

    describe('#claimReferrerTier', () => {
      before(async () => {
        await expect(depositPool.claimReferrerTier(rewardPoolId, OWNER)).to.be.revertedWith("DS: migration isn't over");
      });

      beforeEach(async () => {
        await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);
      });

      it('should claim referrer tier correctly', async () => {
        await depositPool.connect(SECOND).stake(rewardPoolId, wei(10), 0, OWNER);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        await setNextTime(oneDay + oneDay);

        await depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) });

        const poolData = await depositPool.rewardPoolsData(rewardPoolId);
        expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolData.totalVirtualDeposited).to.gt(wei(1));
        expect(poolData.rate).to.gt(0);
        expect(await depositPool.totalDepositedInPublicPools()).to.eq(wei(10));

        const referrerData = await depositPool.referrersData(OWNER, rewardPoolId);
        expect(referrerData.rate).to.eq(poolData.rate);
        expect(referrerData.pendingRewards).to.eq(0);
      });
      describe('#claimReferrerTierFor', () => {
        it('should claim referrer tier correctly, with `claimSender`', async () => {
          await depositPool.connect(SECOND).stake(rewardPoolId, wei(10), 0, OWNER);
          await distributorMock.setDistributedRewardsAnswer(wei(100));

          await setNextTime(oneDay + oneDay);

          await depositPool.setClaimSender(rewardPoolId, [SECOND], [true]);
          await depositPool.connect(SECOND).claimReferrerTierFor(rewardPoolId, OWNER, OWNER, { value: wei(0.5) });
        });
        it('should revert if invalid caller', async () => {
          await expect(
            depositPool.connect(OWNER).claimReferrerTierFor(rewardPoolId, SECOND, OWNER, { value: wei(0.5) }),
          ).to.be.revertedWith('DS: invalid caller');
        });
      });
      it("should revert if `claimLockPeriodAfterClaim` didn't pass", async () => {
        await depositPool.setRewardPoolProtocolDetails(rewardPoolId, 1, 0, 60, 4);

        await setTime(oneDay * 2);
        await depositPool.stake(rewardPoolId, wei(1), 0, OWNER);

        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

        await setTime(oneDay * 3);
        await depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) });
        await expect(depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) })).to.be.revertedWith(
          'DS: pool claim is locked (C)',
        );

        await setTime(oneDay * 3 + 61);
        await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
      });
      it('should revert if nothing to claim', async () => {
        await setNextTime(oneDay + oneDay);
        await expect(depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) })).to.be.revertedWith(
          'DS: nothing to claim',
        );
      });
      it('should revert if nothing to claim', async () => {
        await expect(
          depositPool.claimReferrerTierFor(rewardPoolId, OWNER, OWNER, { value: wei(0.5) }),
        ).to.be.revertedWith('DS: invalid caller');
      });
    });

    describe('#getLatestReferrerReward', () => {
      it("should correctly calculate depositPool rewards if pool if pool hasn't started", async () => {
        const reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);

        expect(reward).to.eq(0);
      });
      it("should correctly calculate depositPool rewards if users didn't stake", async () => {
        await setTime(oneDay * 2);
        const reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);

        expect(reward).to.eq(0);
      });
      it('should correctly calculate rewards for 1 users', async () => {
        await depositPool.editReferrerTiers(rewardPoolId, getDefaultReferrerTiers());

        await depositPool.connect(SECOND).stake(rewardPoolId, wei(10), 0, OWNER);
        let reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);
        expect(reward).to.eq(0);

        await setTime(oneDay + oneDay);
        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100));

        let totalReward = wei(100);
        const secondPart = 1n * (await depositPool.getCurrentUserMultiplier(rewardPoolId, SECOND));
        const referrerPart = 1n * BigInt(referrerTiers[0].multiplier);
        const totalParts = secondPart + referrerPart;
        let rewardPerPart = (totalReward * PRECISION) / totalParts;
        reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);
        expect(reward).to.eq((rewardPerPart * referrerPart) / PRECISION);

        await setTime(oneDay + oneDay * 2);
        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

        totalReward = wei(198);
        rewardPerPart = (totalReward * PRECISION) / totalParts;
        reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);
        expect(reward).to.eq((rewardPerPart * referrerPart) / PRECISION);

        await setNextTime(oneDay + oneDay * 3);
        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

        await depositPool.connect(SECOND).withdraw(rewardPoolId, wei(1));
        await depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) });

        await setTime(oneDay + oneDay * 4);
        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

        totalReward = wei(94);
        rewardPerPart = (totalReward * PRECISION) / totalParts;
        reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);
        expect(reward).to.closeTo((rewardPerPart * referrerPart) / PRECISION, wei(0.1));

        await setNextTime(oneDay + oneDay * 5);
        // Add rewards
        await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92));

        await depositPool.connect(SECOND).withdraw(rewardPoolId, wei(1));
        await depositPool.claimReferrerTier(rewardPoolId, OWNER, { value: wei(0.5) });
        reward = await depositPool.getLatestReferrerReward(rewardPoolId, OWNER);
        expect(reward).to.eq(0);
      });
      it("should return 0 if pool isn't found", async () => {
        const reward = await depositPool.getLatestReferrerReward(3, OWNER);

        expect(reward).to.eq(0);
      });
    });
  });

  describe('#removeUpgradeability', () => {
    it('should revert if caller is not owner', async () => {
      await expect(depositPool.connect(SECOND).removeUpgradeability()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should remove upgradeability', async () => {
      let isNotUpgradeable = await depositPool.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.false;

      await depositPool.removeUpgradeability();

      isNotUpgradeable = await depositPool.isNotUpgradeable();
      expect(isNotUpgradeable).to.be.true;
    });
  });

  describe('#getLatestUserReward', () => {
    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);
    });

    it("should correctly calculate depositPool rewards if pool if pool hasn't started", async () => {
      const reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);

      expect(reward).to.eq(0);
    });
    it("should correctly calculate depositPool rewards if user didn't stake", async () => {
      await setTime(oneDay * 2);
      const reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);

      expect(reward).to.eq(0);
    });
    it('should correctly calculate depositPool rewards if user staked before pool start', async () => {
      await depositPool.stake(rewardPoolId, wei(2), 0, ZERO_ADDR);

      await setTime(oneDay);

      const reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);

      expect(reward).to.eq(0);
    });
    it('should correctly calculate depositPool rewards for 1 user', async () => {
      await depositPool.stake(rewardPoolId, wei(2), 0, ZERO_ADDR);
      let reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.eq(0);

      await setTime(oneDay + oneDay);
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.eq(wei(100));

      await setTime(oneDay + oneDay * 2);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.eq(wei(198));

      await setNextTime(oneDay + oneDay * 3);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      await depositPool.withdraw(rewardPoolId, wei(1));
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });

      await setTime(oneDay + oneDay * 4);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.closeTo(wei(94), wei(0.01));

      await setNextTime(oneDay + oneDay * 5);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92));

      await depositPool.withdraw(rewardPoolId, wei(1));
      await depositPool.claim(rewardPoolId, OWNER, { value: wei(0.5) });
      reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.eq(wei(0));

      await setNextTime(oneDay + oneDay * 7);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90 + 88));

      await depositPool.stake(rewardPoolId, wei(1), 0, ZERO_ADDR);

      await setTime(oneDay + oneDay * 8);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94 + 92 + 90 + 88 + 86));

      reward = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(reward).to.eq(wei(86));
    });
    it('should correctly calculate depositPool rewards if user staked with pool start', async () => {
      await depositPool.stake(rewardPoolId, wei(2), 0, ZERO_ADDR);

      await setTime(oneDay);

      let rewardFirst = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      let rewardSecond = await depositPool.connect(SECOND).getLatestUserReward(rewardPoolId, OWNER);
      expect(rewardFirst).to.eq(0);
      expect(rewardSecond).to.eq(0);

      await setTime(oneDay + oneDay * 0.5);
      await distributorMock.setDistributedRewardsAnswer(wei(100 / 2));

      rewardFirst = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      expect(rewardFirst).to.eq(wei(50));

      await setNextTime(oneDay + oneDay);
      await distributorMock.setDistributedRewardsAnswer(wei(100));

      await depositPool.connect(SECOND).stake(rewardPoolId, wei(3), 0, ZERO_ADDR);

      await setTime(oneDay + oneDay * 2);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98));

      rewardFirst = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      rewardSecond = await depositPool.getLatestUserReward(rewardPoolId, SECOND);

      expect(rewardFirst).to.eq(wei(100 + 39.2));
      expect(rewardSecond).to.eq(wei(58.8));

      await setTime(oneDay + oneDay * 2.5);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 / 2));

      rewardFirst = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      rewardSecond = await depositPool.getLatestUserReward(rewardPoolId, SECOND);

      expect(rewardFirst).to.eq(wei(100 + 58.4));
      expect(rewardSecond).to.eq(wei(87.6));

      await setNextTime(oneDay + oneDay * 3);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96));

      await depositPool.connect(SECOND).withdraw(rewardPoolId, wei(1));
      await depositPool.connect(SECOND).claim(rewardPoolId, SECOND, { value: wei(0.5) });

      await setTime(oneDay + oneDay * 4);
      await distributorMock.setDistributedRewardsAnswer(wei(100 + 98 + 96 + 94));

      rewardFirst = await depositPool.getLatestUserReward(rewardPoolId, OWNER);
      rewardSecond = await depositPool.getLatestUserReward(rewardPoolId, SECOND);

      expect(rewardFirst).to.closeTo(wei(224.6), wei(0.000001));
      expect(rewardSecond).to.closeTo(wei(47), wei(0.001));
    });
    it("should return 0 if pool isn't found", async () => {
      const reward = await depositPool.getLatestUserReward(3, OWNER);

      expect(reward).to.eq(0);
    });
  });

  describe('#getCurrentUserMultiplier', () => {
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate referral multiplier correctly', async () => {
      await depositPool.stake(rewardPoolId, wei(1), 0, OWNER);
      const multiplier = wei(1.01, 25);

      expect(await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER)).to.equal(multiplier);
    });
    it('should calculate total multiplier correctly', async () => {
      await setNextTime(payoutStart + 365 * oneDay);
      await depositPool.stake(rewardPoolId, wei(1), payoutStart + 1742 * oneDay, OWNER);
      const multiplier = wei(0.01, 25);

      expect(await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER)).to.be.greaterThan(multiplier);
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await depositPool.getCurrentUserMultiplier(1, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return 1 if user is not staked', async () => {
      const multiplier = await depositPool.getCurrentUserMultiplier(rewardPoolId, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#getReferrerMultiplier', () => {
    const referrerTiers = getDefaultReferrerTiers();

    beforeEach(async () => {
      await depositPool.migrate(rewardPoolId);

      await depositPool.editReferrerTiers(rewardPoolId, referrerTiers);

      await depositToken.mint(SECOND, wei(1000));
      await depositToken.mint(SECOND, wei(1000));
      await depositToken.mint(SECOND, wei(1000));
      await depositToken.mint(SECOND, wei(1000));

      await depositToken.connect(SECOND).approve(depositPool, MaxUint256);
    });

    it('should calculate multiplier correctly', async () => {
      let multiplier = referrerTiers[0].multiplier;
      expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.equal(0);

      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);
      expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.equal(multiplier);

      for (let i = 1; i < referrerTiers.length; i++) {
        multiplier = BigInt(referrerTiers[i].multiplier);
        const amount = BigInt(referrerTiers[i].amount);

        await depositPool.connect(SECOND).stake(rewardPoolId, amount, 0, OWNER);
        expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.equal(multiplier);
      }
    });
    it('should calculate multiplier correctly from multiple users', async () => {
      let multiplier = referrerTiers[0].multiplier;
      expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.equal(0);

      await depositPool.connect(OWNER).stake(rewardPoolId, wei(1), 0, OWNER);
      await depositPool.connect(SECOND).stake(rewardPoolId, wei(1), 0, OWNER);
      expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.equal(multiplier);

      for (let i = 0; i < referrerTiers.length; i++) {
        multiplier = BigInt(referrerTiers[i].multiplier);
        const amount = BigInt(referrerTiers[i].amount) + 1n;

        const user = i % 2 === 0 ? OWNER : SECOND;

        await depositPool.connect(user).stake(rewardPoolId, amount, 0, OWNER);
        expect(await depositPool.getReferrerMultiplier(rewardPoolId, OWNER)).to.closeTo(multiplier, wei(0.00001, 25));
      }
    });
    it('should return 0 if pool is not exist', async () => {
      const multiplier = await depositPool.getReferrerMultiplier(1, OWNER);

      expect(multiplier).to.eq(0);
    });
    it('should return 1 if referrals is not staked', async () => {
      const multiplier = await depositPool.getReferrerMultiplier(rewardPoolId, OWNER);

      expect(multiplier).to.eq(0);
    });
    it('should return 0 if referrerTiers is empty', async () => {
      await depositPool.editReferrerTiers(rewardPoolId, []);

      const multiplier = await depositPool.getReferrerMultiplier(rewardPoolId, OWNER);

      expect(multiplier).to.eq(0);
    });
    it('should works correctly with a lot referrerTiers', async () => {
      const newReferrerTiers = [];

      for (let i = 0; i < 500; i++) {
        newReferrerTiers.push({ amount: i, multiplier: wei(1, 25) + BigInt(i) });
      }
      await depositPool.editReferrerTiers(rewardPoolId, newReferrerTiers);

      const multiplier = await depositPool.getReferrerMultiplier(rewardPoolId, OWNER);

      expect(multiplier).to.eq(0);
    });
  });
});

// npx hardhat test "test/capital-protocol/DepositPool.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/DepositPool.test.ts"

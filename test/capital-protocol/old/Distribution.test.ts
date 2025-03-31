import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  ArbitrumBridgeGatewayRouterMock,
  Distribution,
  DistributionV2Mock,
  Distribution__factory,
  IDistribution,
  IL1Sender,
  L1Sender,
  L2MessageReceiver,
  L2TokenReceiverV2,
  LZEndpointMock,
  LinearDistributionIntervalDecrease,
  MOR,
  NonfungiblePositionManagerMock,
  StETHMock,
  UniswapSwapRouterMock,
  WStETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setNextTime, setTime } from '@/test/helpers/block-helper';
import { getDefaultPool, oneDay, oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('Distribution', () => {
  const senderChainId = 101;
  const receiverChainId = 110;

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let distributionFactory: Distribution__factory;
  let distribution: Distribution;

  let lib: LinearDistributionIntervalDecrease;

  let rewardToken: MOR;
  let depositToken: StETHMock;
  let wstETH: WStETHMock;

  let lZEndpointMockSender: LZEndpointMock;
  let lZEndpointMockReceiver: LZEndpointMock;

  let l1Sender: L1Sender;
  let l2MessageReceiver: L2MessageReceiver;
  let l2TokenReceiver: L2TokenReceiverV2;

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const [
      libFactory,
      ERC1967ProxyFactory,
      MORFactory,
      stETHMockFactory,
      wstETHMockFactory,
      l1SenderFactory,
      LZEndpointMock,
      L2MessageReceiver,
      L2TokenReceiver,
      gatewayRouterMock,
      SwapRouterMock,
      NonfungiblePositionManagerMock,
    ] = await Promise.all([
      ethers.getContractFactory('LinearDistributionIntervalDecrease'),
      ethers.getContractFactory('ERC1967Proxy'),
      ethers.getContractFactory('MOR'),
      ethers.getContractFactory('StETHMock'),
      ethers.getContractFactory('WStETHMock'),
      ethers.getContractFactory('L1Sender'),
      ethers.getContractFactory('LZEndpointMock'),
      ethers.getContractFactory('L2MessageReceiver'),
      ethers.getContractFactory('L2TokenReceiverV2'),
      ethers.getContractFactory('ArbitrumBridgeGatewayRouterMock'),
      ethers.getContractFactory('UniswapSwapRouterMock'),
      ethers.getContractFactory('NonfungiblePositionManagerMock'),
    ]);

    let gatewayRouter: ArbitrumBridgeGatewayRouterMock;
    let swapRouter: UniswapSwapRouterMock;
    let nonfungiblePositionManager: NonfungiblePositionManagerMock;
    let l2TokenReceiverImplementation: L2TokenReceiverV2;
    let l2MessageReceiverImplementation: L2MessageReceiver;
    let l1SenderImplementation: L1Sender;
    // START deploy contracts without deps
    [
      lib,
      depositToken,
      lZEndpointMockSender,
      lZEndpointMockReceiver,
      gatewayRouter,
      swapRouter,
      nonfungiblePositionManager,
      l2TokenReceiverImplementation,
      l2MessageReceiverImplementation,
      l1SenderImplementation,
    ] = await Promise.all([
      libFactory.deploy(),
      stETHMockFactory.deploy(),
      LZEndpointMock.deploy(senderChainId),
      LZEndpointMock.deploy(receiverChainId),
      gatewayRouterMock.deploy(),
      SwapRouterMock.deploy(),
      NonfungiblePositionManagerMock.deploy(),
      L2TokenReceiver.deploy(),
      L2MessageReceiver.deploy(),
      l1SenderFactory.deploy(),
    ]);

    distributionFactory = await ethers.getContractFactory('Distribution', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    });
    const distributionImplementation = await distributionFactory.deploy();
    // END

    wstETH = await wstETHMockFactory.deploy(depositToken);

    const l2MessageReceiverProxy = await ERC1967ProxyFactory.deploy(l2MessageReceiverImplementation, '0x');
    l2MessageReceiver = L2MessageReceiver.attach(l2MessageReceiverProxy) as L2MessageReceiver;
    await l2MessageReceiver.L2MessageReceiver__init();

    const l2TokenReceiverProxy = await ERC1967ProxyFactory.deploy(l2TokenReceiverImplementation, '0x');
    l2TokenReceiver = L2TokenReceiver.attach(l2TokenReceiverProxy) as L2TokenReceiverV2;
    await l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, {
      tokenIn: depositToken,
      tokenOut: depositToken,
      fee: 3000,
      sqrtPriceLimitX96: 0,
    });

    // START deploy distribution contract
    const distributionProxy = await ERC1967ProxyFactory.deploy(await distributionImplementation.getAddress(), '0x');
    distribution = distributionFactory.attach(await distributionProxy.getAddress()) as Distribution;
    // END

    const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
      gateway: lZEndpointMockSender,
      receiver: l2MessageReceiver,
      receiverChainId: receiverChainId,
      zroPaymentAddress: ZERO_ADDR,
      adapterParams: '0x',
    };
    const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
      token: wstETH,
      gateway: gatewayRouter,
      receiver: l2TokenReceiver,
    };

    const l1SenderProxy = await ERC1967ProxyFactory.deploy(l1SenderImplementation, '0x');
    l1Sender = l1SenderFactory.attach(l1SenderProxy) as L1Sender;
    await l1Sender.L1Sender__init(distribution, rewardTokenConfig, depositTokenConfig);

    // Deploy reward token
    rewardToken = await MORFactory.deploy(wei(1000000000));
    await rewardToken.transferOwnership(l2MessageReceiver);

    await l2MessageReceiver.setParams(rewardToken, {
      gateway: lZEndpointMockReceiver,
      sender: l1Sender,
      senderChainId: senderChainId,
    });

    await lZEndpointMockSender.setDestLzEndpoint(l2MessageReceiver, lZEndpointMockReceiver);

    await distribution.Distribution_init(depositToken, l1Sender, []);

    await Promise.all([depositToken.mint(OWNER.address, wei(1000)), depositToken.mint(SECOND.address, wei(1000))]);
    await Promise.all([
      depositToken.approve(distribution, wei(1000)),
      depositToken.connect(SECOND).approve(distribution, wei(1000)),
    ]);
    await l1Sender.transferOwnership(distribution);

    await reverter.snapshot();

    // await setTime(oneHour + 200);
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        const distribution = await distributionFactory.deploy();

        await expect(distribution.Distribution_init(depositToken, l1Sender, [])).to.be.revertedWith(reason);
      });
    });

    describe('#Distribution_init', () => {
      it('should set correct data after creation', async () => {
        const depositToken_ = await distribution.depositToken();
        expect(depositToken_).to.eq(await depositToken.getAddress());
      });
      it('should create pools with correct data', async () => {
        const pool1 = getDefaultPool();
        const pool2 = {
          ...pool1,
          isPublic: false,
          minimalStake: wei(0),
          payoutStart: oneDay * 2,
          decreaseInterval: oneDay * 2,
        };

        const distributionProxy = await (
          await ethers.getContractFactory('ERC1967Proxy')
        ).deploy(await distributionFactory.deploy(), '0x');

        const distribution = distributionFactory.attach(await distributionProxy.getAddress()) as Distribution;

        await distribution.Distribution_init(depositToken, l1Sender, [pool1, pool2]);

        const pool1Data: IDistribution.PoolStruct = await distribution.pools(0);
        expect(_comparePoolStructs(pool1, pool1Data)).to.be.true;

        const pool2Data: IDistribution.PoolStruct = await distribution.pools(1);
        expect(_comparePoolStructs(pool2, pool2Data)).to.be.true;
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(distribution.Distribution_init(depositToken, l1Sender, [])).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const distributionV2MockFactory = await ethers.getContractFactory('DistributionV2Mock', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const distributionV2MockImplementation = await distributionV2MockFactory.deploy();

        await distribution.upgradeTo(await distributionV2MockImplementation.getAddress());

        const distributionV2Mock = distributionV2MockFactory.attach(
          await distribution.getAddress(),
        ) as DistributionV2Mock;

        expect(await distributionV2Mock.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(distribution.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
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
      const pool = getDefaultPool();

      const tx = await distribution.createPool(pool);
      await expect(tx).to.emit(distribution, 'PoolCreated');

      const poolData: IDistribution.PoolStruct = await distribution.pools(0);
      expect(_comparePoolStructs(pool, poolData)).to.be.true;
    });
    it('should correctly pool with constant reward', async () => {
      const pool = getDefaultPool();
      pool.rewardDecrease = 0;

      await distribution.createPool(pool);

      const poolData: IDistribution.PoolStruct = await distribution.pools(0);
      expect(_comparePoolStructs(pool, poolData)).to.be.true;
    });

    describe('should revert if try to create pool with incorrect data', () => {
      it('if `payoutStart == 0`', async () => {
        const pool = getDefaultPool();
        pool.payoutStart = 0;

        await expect(distribution.createPool(pool)).to.be.rejectedWith('DS: invalid payout start value');
      });
      it('if `decreaseInterval == 0`', async () => {
        const pool = getDefaultPool();
        pool.decreaseInterval = 0;

        await expect(distribution.createPool(pool)).to.be.rejectedWith('DS: invalid decrease interval');
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).createPool(getDefaultPool())).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#editPool', () => {
    const poolId = 0;
    let defaultPool: IDistribution.PoolStruct;

    beforeEach(async () => {
      defaultPool = getDefaultPool();

      await distribution.createPool(getDefaultPool());
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
      };

      const tx = await distribution.editPool(poolId, newPool);
      await expect(tx).to.emit(distribution, 'PoolEdited');

      const poolData: IDistribution.PoolStruct = await distribution.pools(poolId);
      expect(_comparePoolStructs(newPool, poolData)).to.be.true;
    });
    it('should revert if try to change pool type', async () => {
      const newPool = {
        ...defaultPool,
        isPublic: false,
      };

      await expect(distribution.editPool(poolId, newPool)).to.be.rejectedWith('DS: invalid pool type');
    });

    describe('should revert if try to edit pool with incorrect data', () => {
      it('if `decreaseInterval == 0`', async () => {
        const newPool = { ...defaultPool, decreaseInterval: 0 };

        await expect(distribution.editPool(poolId, newPool)).to.be.rejectedWith('DS: invalid decrease interval');
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).editPool(poolId, getDefaultPool())).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.editPool(1, getDefaultPool())).to.be.revertedWith("DS: pool doesn't exist");
    });
  });

  describe('#changeWhitelistedUsers', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = { ...getDefaultPool(), isPublic: false };

      await distribution.createPool(pool);
    });

    it('should correctly imitate stake and withdraw process', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      let tx = await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(1));
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(4));

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await setNextTime(oneHour * 3);
      tx = await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(10), wei(1)]);
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(9));
      await expect(tx).to.emit(distribution, 'UserWithdrawn').withArgs(poolId, OWNER.address, wei(3));

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly calculate and withdraw rewards', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(0), wei(0)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(20), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(19.6), wei(0.001));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(78.4), wei(0.001));

      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
    });
    it('should correctly calculate rewards after partial stake', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      // Stake after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(5), wei(5)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(0), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(80));

      // Claim after 2 day
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20 + 49));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80 + 49), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution start and claim after', async () => {
      let userData;

      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(510));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(2040));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution end and claim after', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(130));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(520));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change after distribution end', async () => {
      let userData;
      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(2), wei(5)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change both at and distribution end', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(2), wei(5)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(130));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(520));
    });
    it('should correctly work if multiple changes in one block', async () => {
      let userData;

      await setNextTime(oneHour * 2);

      await ethers.provider.send('evm_setAutomine', [false]);

      const tx1 = distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);
      const tx2 = distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(2), wei(1)]);
      const tx3 = distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(10), wei(0)]);
      const tx4 = distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      await ethers.provider.send('evm_setAutomine', [true]);
      await ethers.provider.send('evm_mine', []);

      await expect(tx1).to.not.be.reverted;
      await expect(tx2).to.not.be.reverted;
      await expect(tx3).to.not.be.reverted;
      await expect(tx4).to.not.be.reverted;

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(0), wei(0)]);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(39.6), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(158.4), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should do nothing id deposited amount is the same', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await setNextTime(oneHour * 3);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.manageUsersInPrivatePool(1, [], [])).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is public', async () => {
      const pool = getDefaultPool();

      await distribution.createPool(pool);

      await expect(distribution.manageUsersInPrivatePool(1, [], [])).to.be.revertedWith('DS: pool is public');
    });
    it('should revert if lengths of arrays are not equal', async () => {
      await expect(distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [])).to.be.revertedWith(
        'DS: invalid length',
      );

      await expect(distribution.manageUsersInPrivatePool(poolId, [], [wei(1)])).to.be.revertedWith(
        'DS: invalid length',
      );
    });
  });

  describe('#stake', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = getDefaultPool();
      await distribution.createPool(pool);
    });

    it('should stake correctly', async () => {
      // A stakes 1 token
      const tx = await distribution.stake(poolId, wei(1));
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(1));

      let userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      let poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(1));

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      await distribution.stake(poolId, wei(3));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalDeposited).to.eq(wei(4));
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(4));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await distribution.connect(SECOND).stake(poolId, wei(8));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalDeposited).to.eq(wei(12));
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.stake(1, wei(1))).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is private', async () => {
      const pool = { ...getDefaultPool(), isPublic: false };
      await distribution.createPool(pool);
      await expect(distribution.stake(1, wei(1))).to.be.revertedWith("DS: pool isn't public");
    });
    it('should revert if amount is less than minimal stake', async () => {
      const pool = { ...getDefaultPool(), minimalStake: wei(2) };
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
      await distribution.createPool(getDefaultPool());
    });

    it('should correctly claim, one user, without redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      const tx = await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await expect(tx).to.emit(distribution, 'UserClaimed').withArgs(poolId, SECOND.address, SECOND.address, wei(198));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(198));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(294));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(570));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Deposit 1 day after the start of reward payment
      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(100));

      // Claim after 1.5 days
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 4 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(239));

      // Claim after 5.25 days
      await setNextTime(oneDay + oneDay * 5.25);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(149 + 353.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(98));
      const userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, without redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72), wei(0.01));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72 + 207), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24 + 69), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim zero reward when poll reward is zero', async () => {
      let userData;

      const newPool = {
        ...getDefaultPool(),
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
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly continue claim reward after pool stop (zero reward)', async () => {
      let userData;

      const newPool = {
        ...getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      await setNextTime(oneDay + oneDay * 2);
      await distribution.editPool(poolId, newPool);

      await setNextTime(oneDay + oneDay * 3);
      await distribution.editPool(poolId, getDefaultPool());

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 70.5), wei(0.01));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 23.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim for receiver', async () => {
      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(198));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      const userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should not save reward to pending reward if cannot mint reward token', async () => {
      const amountToMintMaximum = (await rewardToken.cap()) - (await rewardToken.totalSupply());

      await _getRewardTokenFromPool(distribution, amountToMintMaximum - wei(1), OWNER);

      await distribution.stake(poolId, wei(10));

      await setNextTime(oneDay + oneDay);

      let tx = await distribution.claim(poolId, OWNER, { value: wei(0.5) });
      await expect(tx).to.changeTokenBalance(rewardToken, OWNER, wei(100));
      let userData = await distribution.usersData(OWNER, poolId);
      expect(userData.pendingRewards).to.equal(wei(0));

      await setNextTime(oneDay + oneDay * 2);

      tx = await distribution.claim(poolId, OWNER, { value: wei(0.5) });
      await expect(tx).to.changeTokenBalance(rewardToken, OWNER, wei(98));
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.pendingRewards).to.equal(wei(0));
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.connect(SECOND).claim(1, SECOND)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1));

      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith('DS: pool claim is locked');
    });
    it('should revert if nothing to claim', async () => {
      const newPool = {
        ...getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneHour * 3);
      await distribution.editPool(poolId, newPool);

      await setNextTime(oneDay + oneDay);
      await expect(distribution.connect(SECOND).claim(poolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
    });
    it('should correctly claim, real data', async () => {
      let reward;

      const newPool = {
        ...getDefaultPool(),
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
      };

      const [, , COMMUNITY, CODERS, COMPUTE, CAPITAL, PROTECTION] = await ethers.getSigners();

      await depositToken.mint(await COMMUNITY.getAddress(), wei(1000));
      await depositToken.connect(COMMUNITY).approve(await distribution.getAddress(), wei(1000));
      await depositToken.mint(await CODERS.getAddress(), wei(1000));
      await depositToken.connect(CODERS).approve(await distribution.getAddress(), wei(1000));
      await depositToken.mint(await COMPUTE.getAddress(), wei(1000));
      await depositToken.connect(COMPUTE).approve(await distribution.getAddress(), wei(1000));
      await depositToken.mint(await CAPITAL.getAddress(), wei(1000));
      await depositToken.connect(CAPITAL).approve(await distribution.getAddress(), wei(1000));
      await depositToken.mint(await PROTECTION.getAddress(), wei(1000));
      await depositToken.connect(PROTECTION).approve(await distribution.getAddress(), wei(1000));

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
      await distribution.createPool({ ...getDefaultPool(), withdrawLockPeriodAfterStake: oneDay - 1 });
    });

    it('should correctly withdraw, few users, withdraw all', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3));

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      const tx = await distribution.connect(OWNER).withdraw(poolId, wei(999));
      await expect(tx).to.emit(distribution, 'UserWithdrawn').withArgs(poolId, OWNER.address, wei(3));
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(1));

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.000001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).withdraw(poolId, wei(999));
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5 + 96 + 94), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(0));

      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith('DS: nothing to claim');
      await expect(distribution.connect(SECOND).claim(poolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
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
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000 - 6 + 2));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8 + 48), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 4 days
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).withdraw(poolId, wei(2));
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000 - 4 + 2));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48 + 47), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 5 days
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(58.8 + 48 + 47 + 61.33333), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 39.2 + 48 + 47 + 30.66666), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly withdraw, when pool is no started', async () => {
      await setNextTime(oneHour * 2);
      await distribution.connect(OWNER).stake(poolId, wei(4));

      await setNextTime(oneHour * 3);
      await distribution.connect(OWNER).withdraw(poolId, wei(4));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      const userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly withdraw, when not enough tokens', async () => {
      await distribution.stake(poolId, wei(10));
      await distribution.connect(SECOND).stake(poolId, wei(10));
      expect(await depositToken.balanceOf(distribution)).to.eq(wei(20));

      await setNextTime(oneDay + oneDay);
      await depositToken.setTotalPooledEther(((await depositToken.totalPooledEther()) * 8n) / 10n);
      expect(await depositToken.balanceOf(distribution)).to.eq(wei(16));

      let tx = await distribution.withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalance(depositToken, OWNER.address, wei(10));
      let userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(await depositToken.balanceOf(distribution)).to.eq(wei(6));

      tx = await distribution.connect(SECOND).withdraw(poolId, wei(999));
      await expect(tx).to.changeTokenBalance(depositToken, SECOND.address, wei(6));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(await depositToken.balanceOf(distribution)).to.eq(wei(0));
    });
    it('should revert if trying to withdraw zero', async () => {
      await distribution.stake(poolId, wei(10));

      await depositToken.setTotalPooledEther(wei(0.0001, 25));

      await distribution.withdraw(poolId, wei(10));

      await expect(distribution.withdraw(poolId, 0)).to.be.revertedWith('DS: nothing to withdraw');
    });
    it("should revert if user didn't stake", async () => {
      await expect(distribution.withdraw(poolId, 1)).to.be.revertedWith("DS: user isn't staked");
    });
    it("should revert if pool isn't found", async () => {
      await expect(distribution.withdraw(111, 1)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it("should revert if `minimalStake` didn't pass", async () => {
      await distribution.stake(poolId, wei(1));

      await setNextTime(oneDay + oneDay * 2);

      await expect(distribution.withdraw(poolId, wei(0.99))).to.be.revertedWith('DS: invalid withdraw amount');
    });
    it('should revert if pool is private', async () => {
      const pool = { ...getDefaultPool(), isPublic: false };
      await distribution.createPool(pool);
      await expect(distribution.withdraw(1, wei(1))).to.be.revertedWith("DS: pool isn't public");
    });
    it("should not revert if `withdrawLockPeriod` didn't pass, but the pool haven`t started", async () => {
      await distribution.stake(poolId, wei(10));

      await expect(distribution.withdraw(poolId, wei(1))).to.be.not.reverted;
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1));

      await setNextTime(oneDay);

      await expect(distribution.withdraw(poolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
    it("should revert if `withdrawLockPeriodAfterStake didn't pass", async () => {
      await setNextTime(oneDay * 10);

      await distribution.stake(poolId, wei(1));

      await expect(distribution.withdraw(poolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
  });

  describe('#removeUpgradeability', () => {
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).removeUpgradeability()).to.be.revertedWith(
        'Ownable: caller is not the owner',
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
      const pool = getDefaultPool();

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
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      await setTime(oneDay + oneDay * 4);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.closeTo(wei(94), wei(0.01));

      await setNextTime(oneDay + oneDay * 5);
      await distribution.withdraw(poolId, wei(1));
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });
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
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      await setTime(oneDay + oneDay * 4);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      rewardSecond = await distribution.getCurrentUserReward(poolId, SECOND);

      expect(rewardFirst).to.closeTo(wei(224.6), wei(0.000001));
      expect(rewardSecond).to.closeTo(wei(47), wei(0.001));
    });
    it('should correctly calculate distribution rewards with real data', async () => {
      const pool: IDistribution.PoolStruct = {
        payoutStart: oneDay,
        decreaseInterval: oneDay,
        withdrawLockPeriod: 1,
        claimLockPeriod: 1,
        withdrawLockPeriodAfterStake: 0,
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
    it("should return 0 if pool isn't found", async () => {
      const reward = await distribution.getCurrentUserReward(3, OWNER);

      expect(reward).to.eq(0);
    });
  });

  describe('#overplus', () => {
    beforeEach(async () => {
      const pool = getDefaultPool();

      await distribution.createPool(pool);
      await distribution.createPool(pool);
    });
    it('should return 0 if deposit token is not changed', async () => {
      await distribution.stake(0, wei(1));

      await setTime(oneDay * 9999);

      const overplus = await distribution.overplus();
      expect(overplus).to.eq(0);
    });
    it('should return 0 if deposited token decreased', async () => {
      await distribution.stake(0, wei(1));

      await setTime(oneDay * 9999);

      await depositToken.setTotalPooledEther(wei(0.5));

      const overplus = await distribution.overplus();
      expect(overplus).to.eq(0);
    });
    it('should return overplus if deposited token increased', async () => {
      await distribution.stake(0, wei(1));

      await depositToken.setTotalPooledEther((await depositToken.totalPooledEther()) * 2n);

      let overplus = await distribution.overplus();
      expect(overplus).to.eq(wei(1));

      await distribution.stake(1, wei(1));

      overplus = await distribution.overplus();
      expect(overplus).to.eq(wei(1));

      await depositToken.setTotalPooledEther((await depositToken.totalPooledEther()) / 2n);

      overplus = await distribution.overplus();
      expect(overplus).to.eq(0);

      await depositToken.setTotalPooledEther((await depositToken.totalPooledEther()) * 5n);

      overplus = await distribution.overplus();
      expect(overplus).to.eq(wei(5.5));
    });
  });

  describe('#bridgeOverplus', () => {
    beforeEach(async () => {
      await depositToken.mint(OWNER, wei(100));
      await _getRewardTokenFromPool(distribution, wei(100), OWNER);

      const pool = getDefaultPool();

      await distribution.createPool(pool);
    });
    it('should bridge overplus', async () => {
      const l2TokenReceiverAddress = await l2TokenReceiver.getAddress();

      await distribution.stake(1, wei(1));

      await depositToken.setTotalPooledEther((await depositToken.totalPooledEther()) * 2n);

      const overplus = await distribution.overplus();
      expect(overplus).to.eq(wei(1));

      const bridgeMessageId = await distribution.bridgeOverplus.staticCall(1, 1, 1);
      const tx = await distribution.bridgeOverplus(1, 1, 1);
      await expect(tx).to.emit(distribution, 'OverplusBridged').withArgs(wei(1), bridgeMessageId);
      await expect(tx).to.changeTokenBalance(depositToken, distribution, wei(-1));
      expect(await wstETH.balanceOf(l2TokenReceiverAddress)).to.eq(wei(1));
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).bridgeOverplus(1, 1, 1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if overplus is <= 0', async () => {
      await expect(distribution.bridgeOverplus(1, 1, 1)).to.be.revertedWith('DS: overplus is zero');
    });
  });
});

// @dev: should be called before other pool creation
const _getRewardTokenFromPool = async (distribution: Distribution, amount: bigint, user: SignerWithAddress) => {
  const poolId = await _getNextPoolId(distribution);
  const pool: IDistribution.PoolStruct = {
    initialReward: amount,
    rewardDecrease: amount,
    payoutStart: (await getCurrentBlockTime()) + 2,
    decreaseInterval: 1,
    withdrawLockPeriod: 0,
    claimLockPeriod: 0,
    withdrawLockPeriodAfterStake: 0,
    isPublic: true,
    minimalStake: 0,
  };

  await distribution.createPool(pool);
  await distribution.connect(user).stake(poolId, wei(1));
  await distribution.connect(user).withdraw(poolId, wei(1));
};

const _getNextPoolId = async (distribution: Distribution) => {
  let poolId = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await distribution.pools(poolId);

      poolId++;
    } catch (e) {
      return poolId;
    }
  }
};

const _comparePoolStructs = (a: IDistribution.PoolStruct, b: IDistribution.PoolStruct): boolean => {
  return (
    a.payoutStart.toString() === b.payoutStart.toString() &&
    a.decreaseInterval.toString() === b.decreaseInterval.toString() &&
    a.withdrawLockPeriod.toString() === b.withdrawLockPeriod.toString() &&
    a.claimLockPeriod.toString() === b.claimLockPeriod.toString() &&
    a.withdrawLockPeriodAfterStake.toString() === b.withdrawLockPeriodAfterStake.toString() &&
    a.initialReward.toString() === b.initialReward.toString() &&
    a.rewardDecrease.toString() === b.rewardDecrease.toString() &&
    a.minimalStake.toString() === b.minimalStake.toString() &&
    a.isPublic === b.isPublic
  );
};

// npx hardhat test "test/capital-protocol/old/Distribution.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/old/Distribution.test.ts"

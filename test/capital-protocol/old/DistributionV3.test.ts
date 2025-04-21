import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  ArbitrumBridgeGatewayRouterMock,
  Distribution,
  DistributionV3,
  DistributionV3__factory,
  IDistributionV3,
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
import { PRECISION, ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setNextTime, setTime } from '@/test/helpers/block-helper';
import { getDefaultPool, oneDay, oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('DistributionV3', () => {
  const senderChainId = 101;
  const receiverChainId = 110;

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let distributionFactory: DistributionV3__factory;
  let distribution: DistributionV3;
  let distributionImplementation: DistributionV3;

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

    distributionFactory = await ethers.getContractFactory('DistributionV3', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    });
    distributionImplementation = await distributionFactory.deploy();
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
    distribution = distributionFactory.attach(await distributionProxy.getAddress()) as DistributionV3;
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

    await reverter.snapshot();
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

        const distribution = distributionFactory.attach(await distributionProxy.getAddress()) as DistributionV3;

        await distribution.Distribution_init(depositToken, l1Sender, [pool1, pool2]);

        const pool1Data: IDistributionV3.PoolStruct = await distribution.pools(0);
        expect(_comparePoolStructs(pool1, pool1Data)).to.be.true;

        const pool2Data: IDistributionV3.PoolStruct = await distribution.pools(1);
        expect(_comparePoolStructs(pool2, pool2Data)).to.be.true;
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(distribution.Distribution_init(depositToken, l1Sender, [])).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade, check stake', async () => {
        // Deploy V1 and setup
        const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy');
        const distributionV1Factory = await ethers.getContractFactory('Distribution', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });

        const distributionV1Implementation = await distributionV1Factory.deploy();
        const distributionV1Proxy = await ERC1967ProxyFactory.deploy(
          await distributionV1Implementation.getAddress(),
          '0x',
        );
        const distributionV1 = distributionV1Factory.attach(await distributionV1Proxy.getAddress()) as Distribution;

        await Promise.all([
          l1Sender.setDistribution(distributionV1),
          distributionV1.Distribution_init(depositToken, l1Sender, []),
          depositToken.approve(distributionV1, wei(1000)),
          depositToken.connect(SECOND).approve(distributionV1, wei(1000)),
        ]);

        // Create pool
        await distributionV1.connect(OWNER).createPool(getDefaultPool());

        // Stake
        const poolId = 0;

        // A stakes 1 token
        await setNextTime(oneDay * 1);
        const tx = await distributionV1.stake(poolId, wei(1));
        await expect(tx).to.emit(distributionV1, 'UserStaked').withArgs(poolId, OWNER.address, wei(1));

        const userDataV1 = await distributionV1.usersData(OWNER.address, poolId);
        expect(userDataV1.deposited).to.eq(wei(1));
        expect(userDataV1.rate).to.eq(0);
        expect(userDataV1.pendingRewards).to.eq(0);
        const poolDataV1 = await distributionV1.poolsData(poolId);
        expect(poolDataV1.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolDataV1.rate).to.eq(0);
        expect(await distributionV1.totalDepositedInPublicPools()).to.eq(wei(1));

        // Upgrade
        await distributionV1.upgradeTo(await distributionImplementation.getAddress());
        const DistributionV3Factory = await ethers.getContractFactory('DistributionV3', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const DistributionV3 = DistributionV3Factory.attach(await distributionV1.getAddress()) as DistributionV3;

        // A stakes 2 tokens
        await setNextTime(oneDay * 2);
        await DistributionV3.stake(poolId, wei(3), 0);
        let userData = await DistributionV3.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4));
        expect(userData.rate).to.eq(wei(100, 25));
        expect(userData.pendingRewards).to.eq(wei(100));
        expect(userData.claimLockStart).to.eq(oneDay * 2);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
        let poolData = await DistributionV3.poolsData(poolId);
        expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolData.totalVirtualDeposited).to.eq(wei(4));
        expect(poolData.rate).to.eq(wei(100, 25));
        expect(await DistributionV3.totalDepositedInPublicPools()).to.eq(wei(4));

        // B stakes 8 tokens
        await setNextTime(oneDay * 3);
        await DistributionV3.connect(SECOND).stake(poolId, wei(8), 0);
        userData = await DistributionV3.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(8));
        expect(userData.virtualDeposited).to.eq(wei(8));
        expect(userData.rate).to.eq(wei(124.5, 25));
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(oneDay * 3);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
        poolData = await DistributionV3.poolsData(poolId);
        expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolData.totalVirtualDeposited).to.eq(wei(12));
        expect(poolData.rate).to.eq(wei(124.5, 25));
        expect(await DistributionV3.totalDepositedInPublicPools()).to.eq(wei(12));
      });
      it('should correctly upgrade, check withdraw', async () => {
        // Deploy V1 and setup
        const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy');
        const distributionV1Factory = await ethers.getContractFactory('Distribution', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });

        const distributionV1Implementation = await distributionV1Factory.deploy();
        const distributionV1Proxy = await ERC1967ProxyFactory.deploy(
          await distributionV1Implementation.getAddress(),
          '0x',
        );
        const distributionV1 = distributionV1Factory.attach(await distributionV1Proxy.getAddress()) as Distribution;

        await Promise.all([
          l1Sender.setDistribution(distributionV1),
          distributionV1.Distribution_init(depositToken, l1Sender, []),
          depositToken.approve(distributionV1, wei(1000)),
          depositToken.connect(SECOND).approve(distributionV1, wei(1000)),
        ]);

        // Create pool
        await distributionV1.connect(OWNER).createPool(getDefaultPool());

        // Stake
        const poolId = 0;

        // A stakes 1 token
        await setNextTime(oneDay * 1);
        const tx = await distributionV1.stake(poolId, wei(1));
        await expect(tx).to.emit(distributionV1, 'UserStaked').withArgs(poolId, OWNER.address, wei(1));

        const userDataV1 = await distributionV1.usersData(OWNER.address, poolId);
        expect(userDataV1.deposited).to.eq(wei(1));
        expect(userDataV1.rate).to.eq(0);
        expect(userDataV1.pendingRewards).to.eq(0);
        const poolDataV1 = await distributionV1.poolsData(poolId);
        expect(poolDataV1.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolDataV1.rate).to.eq(0);
        expect(await distributionV1.totalDepositedInPublicPools()).to.eq(wei(1));

        // Upgrade
        await distributionV1.upgradeTo(await distributionImplementation.getAddress());
        const DistributionV3Factory = await ethers.getContractFactory('DistributionV3', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const DistributionV3 = DistributionV3Factory.attach(await distributionV1.getAddress()) as DistributionV3;

        // A stakes 2 tokens
        await setNextTime(oneDay * 2);
        await DistributionV3.stake(poolId, wei(3), 0);
        let userData = await DistributionV3.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4));
        expect(userData.rate).to.eq(wei(100, 25));
        expect(userData.pendingRewards).to.eq(wei(100));
        expect(userData.claimLockStart).to.eq(oneDay * 2);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
        let poolData = await DistributionV3.poolsData(poolId);
        expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolData.totalVirtualDeposited).to.eq(wei(4));
        expect(poolData.rate).to.eq(wei(100, 25));
        expect(await DistributionV3.totalDepositedInPublicPools()).to.eq(wei(4));

        // B stakes 8 tokens
        await setNextTime(oneDay * 3);
        await DistributionV3.connect(SECOND).stake(poolId, wei(8), 0);
        userData = await DistributionV3.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(8));
        expect(userData.virtualDeposited).to.eq(wei(8));
        expect(userData.rate).to.eq(wei(124.5, 25));
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(oneDay * 3);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
        poolData = await DistributionV3.poolsData(poolId);
        expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
        expect(poolData.totalVirtualDeposited).to.eq(wei(12));
        expect(poolData.rate).to.eq(wei(124.5, 25));
        expect(await DistributionV3.totalDepositedInPublicPools()).to.eq(wei(12));
      });
      it('should correctly upgrade, check claim', async () => {
        // Deploy V1 and setup
        const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy');
        const distributionV1Factory = await ethers.getContractFactory('Distribution', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });

        const distributionV1Implementation = await distributionV1Factory.deploy();
        const distributionV1Proxy = await ERC1967ProxyFactory.deploy(
          await distributionV1Implementation.getAddress(),
          '0x',
        );
        const distributionV1 = distributionV1Factory.attach(await distributionV1Proxy.getAddress()) as Distribution;

        await Promise.all([
          l1Sender.setDistribution(distributionV1),
          distributionV1.Distribution_init(depositToken, l1Sender, []),
          depositToken.approve(distributionV1, wei(1000)),
          depositToken.connect(SECOND).approve(distributionV1, wei(1000)),
        ]);

        // Create pool
        await distributionV1.connect(OWNER).createPool(getDefaultPool());

        // Stake
        const poolId = 0;
        let userData;

        await setNextTime(oneHour * 2);
        await distributionV1.connect(SECOND).stake(poolId, wei(1));

        await setNextTime(oneDay + oneDay);
        await distributionV1.connect(OWNER).stake(poolId, wei(3));

        await setNextTime(oneDay + oneDay * 2);
        await distributionV1.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
        await distributionV1.claim(poolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
        userData = await distributionV1.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5), wei(0.000001));
        userData = await distributionV1.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);

        expect((await distributionV1.poolsData(poolId)).totalDeposited).to.eq(wei(4));

        // Upgrade
        await distributionV1.upgradeTo(await distributionImplementation.getAddress());
        const DistributionV3Factory = await ethers.getContractFactory('DistributionV3', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const DistributionV3 = DistributionV3Factory.attach(await distributionV1.getAddress()) as DistributionV3;

        await setTime(oneDay + oneDay * 3);
        expect(await DistributionV3.getCurrentUserReward(poolId, OWNER.address)).to.closeTo(wei(72), wei(0.01));
        expect((await DistributionV3.poolsData(poolId)).totalVirtualDeposited).to.eq(wei(4));
        expect(await DistributionV3.version()).to.eq(3);

        // Claim after 1 day
        await DistributionV3.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
        await DistributionV3.claim(poolId, OWNER, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72), wei(0.01));
        userData = await DistributionV3.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24), wei(0.01));
        userData = await DistributionV3.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly upgrade', async () => {
        const DistributionV3MockFactory = await ethers.getContractFactory('Distribution', {
          libraries: {
            LinearDistributionIntervalDecrease: await lib.getAddress(),
          },
        });
        const DistributionV3MockImplementation = await DistributionV3MockFactory.deploy();

        await distribution.upgradeTo(await DistributionV3MockImplementation.getAddress());
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

      const poolData: IDistributionV3.PoolStruct = await distribution.pools(0);
      expect(_comparePoolStructs(pool, poolData)).to.be.true;
    });
    it('should correctly pool with constant reward', async () => {
      const pool = getDefaultPool();
      pool.rewardDecrease = 0;

      await distribution.createPool(pool);

      const poolData: IDistributionV3.PoolStruct = await distribution.pools(0);
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
    let defaultPool: IDistributionV3.PoolStruct;

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

      const poolData: IDistributionV3.PoolStruct = await distribution.pools(poolId);
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

  describe('#manageUsersInPrivatePool', () => {
    const poolId = 0;

    beforeEach(async () => {
      const pool = { ...getDefaultPool(), isPublic: false };

      await distribution.createPool(pool);
    });

    it('should correctly imitate stake and withdraw process', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      let tx = await distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
      );
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(1));
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(4));
      await expect(tx)
        .to.emit(distribution, 'UserClaimLocked')
        .withArgs(poolId, SECOND.address, await getCurrentBlockTime(), await getCurrentBlockTime());
      await expect(tx)
        .to.emit(distribution, 'UserClaimLocked')
        .withArgs(poolId, OWNER.address, await getCurrentBlockTime(), await getCurrentBlockTime());

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await setNextTime(oneHour * 3);
      tx = await distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(10), wei(1)],
        [0, 0],
      );
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(9));
      await expect(tx)
        .to.emit(distribution, 'UserClaimLocked')
        .withArgs(poolId, SECOND.address, await getCurrentBlockTime(), await getCurrentBlockTime());

      await expect(tx).to.emit(distribution, 'UserWithdrawn').withArgs(poolId, OWNER.address, wei(3));

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.eq(wei(10));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly calculate and withdraw rewards', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(0), wei(0)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(20), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(19.6), wei(0.001));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.closeTo(wei(78.4), wei(0.001));

      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
    });
    it('should correctly calculate rewards after partial stake', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      // Stake after 1 day
      await setNextTime(oneDay + oneDay * 1);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(5), wei(5)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(0), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(80));

      // Claim after 2 day
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(20 + 49));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80 + 49), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution start and claim after', async () => {
      let userData;

      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      await setNextTime(oneDay * 20000);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(510));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(2040));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change before distribution end and claim after', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      await setNextTime(oneDay * 20000);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(130));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(520));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change after distribution end', async () => {
      let userData;
      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(2), wei(5)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(0));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(0));
    });
    it('should correctly calculate rewards if change both at and distribution end', async () => {
      let userData;

      await setNextTime(oneDay + oneDay * 25);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      await setNextTime(oneDay * 20000);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(2), wei(5)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(0);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(130));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(5));
      expect(userData.virtualDeposited).to.eq(wei(5));
      expect(userData.pendingRewards).to.eq(wei(520));
    });
    it('should correctly work if multiple changes in one block', async () => {
      let userData;

      await setNextTime(oneHour * 2);

      await ethers.provider.send('evm_setAutomine', [false]);

      const tx1 = distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
      );
      const tx2 = distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(2), wei(1)],
        [0, 0],
      );
      const tx3 = distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(10), wei(0)],
        [0, 0],
      );
      const tx4 = distribution.manageUsersInPrivatePool(
        poolId,
        [SECOND.address, OWNER.address],
        [wei(1), wei(4)],
        [0, 0],
      );

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
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(80), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      // Withdraw after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(0), wei(0)], [0, 0]);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(39.6), wei(0.001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(158.4), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.virtualDeposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should handle deposited amount and cliamLockEnd are the same', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(0);

      await setNextTime(oneDay * 2);
      await distribution.manageUsersInPrivatePool(poolId, [SECOND.address, OWNER.address], [wei(1), wei(4)], [0, 0]);

      expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(wei(20));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.pendingRewards).to.eq(wei(80));
    });

    describe('with provided claimLockEnd', () => {
      const payoutStart = 1707393600;
      const periodStart = 1721908800;
      const claimLockEnd = periodStart + 300 * oneDay - 1;

      const newPool = {
        ...getDefaultPool(),
        isPublic: false,
        payoutStart: payoutStart,
        initialReward: wei(10000),
        rewardDecrease: wei(1),
      };

      beforeEach(async () => {
        await distribution.editPool(poolId, newPool);
      });

      it('should correctly imitate stake and withdraw process', async () => {
        let userData, multiplier;

        let tx = await distribution.manageUsersInPrivatePool(
          poolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
        );
        await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(1));
        await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(4));
        await expect(tx)
          .to.emit(distribution, 'UserClaimLocked')
          .withArgs(poolId, SECOND.address, await getCurrentBlockTime(), claimLockEnd);
        await expect(tx)
          .to.emit(distribution, 'UserClaimLocked')
          .withArgs(poolId, OWNER.address, await getCurrentBlockTime(), claimLockEnd);

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await distribution.usersData(SECOND.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await distribution.usersData(OWNER.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        await setNextTime((await getCurrentBlockTime()) + 1);
        tx = await distribution.manageUsersInPrivatePool(
          poolId,
          [SECOND.address, OWNER.address],
          [wei(10), wei(1)],
          [claimLockEnd, claimLockEnd],
        );
        await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, SECOND.address, wei(9));
        await expect(tx).to.emit(distribution, 'UserWithdrawn').withArgs(poolId, OWNER.address, wei(3));
        await expect(tx)
          .to.emit(distribution, 'UserClaimLocked')
          .withArgs(poolId, SECOND.address, await getCurrentBlockTime(), claimLockEnd);

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await distribution.usersData(SECOND.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(10));
        expect(userData.virtualDeposited).to.eq((wei(10) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await distribution.usersData(OWNER.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly calculate and withdraw rewards', async () => {
        let userData;

        await distribution.manageUsersInPrivatePool(
          poolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd],
        );

        await setTime(claimLockEnd);
        await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
        await distribution.claim(poolId, OWNER, { value: wei(0.5) });

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(4570722 / 5), wei(0.001));
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei((4570722 * 4) / 5), wei(0.1));
        userData = await distribution.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq(wei(4));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should save claimLockEnd changes only', async () => {
        let userData, multiplier;

        await distribution.manageUsersInPrivatePool(
          poolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd, claimLockEnd * 2],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await distribution.usersData(SECOND.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await distribution.usersData(OWNER.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.eq(0);
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

        await setNextTime(claimLockEnd + 1);

        await distribution.manageUsersInPrivatePool(
          poolId,
          [SECOND.address, OWNER.address],
          [wei(1), wei(4)],
          [claimLockEnd * 2, claimLockEnd * 2 + 200 * oneDay],
        );

        expect(await depositToken.balanceOf(SECOND.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await distribution.usersData(SECOND.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq((wei(1) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.lt(wei(4570722 / 5));
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

        expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
        expect(await rewardToken.balanceOf(OWNER.address)).to.eq(wei(0));
        userData = await distribution.usersData(OWNER.address, poolId);
        multiplier = await distribution.getCurrentUserMultiplier(poolId, OWNER);
        expect(userData.deposited).to.eq(wei(4));
        expect(userData.virtualDeposited).to.eq((wei(4) * multiplier) / PRECISION);
        expect(userData.pendingRewards).to.gt(wei((4570722 * 4) / 5));
        expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
        expect(userData.claimLockEnd).to.eq(claimLockEnd * 2 + 200 * oneDay);
      });
      it('should set claimLockEnd properly if providing 0', async () => {
        await distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [wei(1)], [0]);
        let userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

        await distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [wei(1)], [0]);
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

        await distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [wei(1)], [claimLockEnd]);
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.claimLockEnd).to.eq(claimLockEnd);

        await distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [wei(1)], [0]);
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.claimLockEnd).to.eq(claimLockEnd);
      });
    });

    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distribution.connect(SECOND).manageUsersInPrivatePool(poolId, [], [], [])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.manageUsersInPrivatePool(1, [], [], [])).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is public', async () => {
      const pool = getDefaultPool();

      await distribution.createPool(pool);

      await expect(distribution.manageUsersInPrivatePool(1, [], [], [])).to.be.revertedWith('DS: pool is public');
    });
    it('should revert if lengths of arrays are not equal', async () => {
      await expect(distribution.manageUsersInPrivatePool(poolId, [SECOND.address], [], [])).to.be.revertedWith(
        'DS: invalid length',
      );

      await expect(distribution.manageUsersInPrivatePool(poolId, [], [wei(1)], [])).to.be.revertedWith(
        'DS: invalid length',
      );

      await expect(distribution.manageUsersInPrivatePool(poolId, [], [], [0])).to.be.revertedWith('DS: invalid length');
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
      await setNextTime(oneDay * 1);
      const tx = await distribution.stake(poolId, wei(1), 0);
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(1));
      await expect(tx)
        .to.emit(distribution, 'UserClaimLocked')
        .withArgs(poolId, OWNER.address, await getCurrentBlockTime(), await getCurrentBlockTime());

      let userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(oneDay);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      let poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(1));

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      await distribution.stake(poolId, wei(3), 0);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(wei(4));
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      expect(userData.claimLockStart).to.eq(oneDay * 2);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(4));
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(4));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await distribution.connect(SECOND).stake(poolId, wei(8), 0);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(wei(8));
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(oneDay * 3);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(12));
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it('should stake with lock correctly', async () => {
      const claimLockEnd = oneDay * 10;
      // A stakes 1 token
      const tx = await distribution.stake(poolId, wei(1), claimLockEnd);
      await expect(tx).to.emit(distribution, 'UserStaked').withArgs(poolId, OWNER.address, wei(1));
      await expect(tx)
        .to.emit(distribution, 'UserClaimLocked')
        .withArgs(poolId, OWNER.address, await getCurrentBlockTime(), claimLockEnd);

      let userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.rate).to.eq(0);
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      let poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(wei(1));
      expect(poolData.rate).to.eq(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(1));

      // A stakes 2 tokens
      await setNextTime(oneDay * 2);
      await distribution.stake(poolId, wei(3), claimLockEnd);
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(4));
      expect(userData.virtualDeposited).to.eq(
        (wei(4) * (await distribution.getCurrentUserMultiplier(poolId, OWNER))) / PRECISION,
      );
      expect(userData.rate).to.eq(wei(100, 25));
      expect(userData.pendingRewards).to.eq(wei(100));
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await distribution.getCurrentUserMultiplier(poolId, OWNER))) / PRECISION,
      );
      expect(poolData.rate).to.eq(wei(100, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(4));

      // B stakes 8 tokens
      await setNextTime(oneDay * 3);
      await distribution.connect(SECOND).stake(poolId, wei(8), claimLockEnd);
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(8));
      expect(userData.virtualDeposited).to.eq(
        (wei(8) * (await distribution.getCurrentUserMultiplier(poolId, SECOND))) / PRECISION,
      );
      expect(userData.rate).to.eq(wei(124.5, 25));
      expect(userData.pendingRewards).to.eq(0);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd);
      poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.eq(
        (wei(4) * (await distribution.getCurrentUserMultiplier(poolId, OWNER))) / PRECISION +
          (wei(8) * (await distribution.getCurrentUserMultiplier(poolId, SECOND))) / PRECISION,
      );
      expect(poolData.rate).to.eq(wei(124.5, 25));
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(12));
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.stake(1, wei(1), 0)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if pool is private', async () => {
      const pool = { ...getDefaultPool(), isPublic: false, payoutStart: (await getCurrentBlockTime()) + 2 };
      await distribution.createPool(pool);
      await expect(distribution.stake(1, wei(1), 0)).to.be.revertedWith("DS: pool isn't public");
    });
    it('should revert if amount is less than minimal stake', async () => {
      const pool = { ...getDefaultPool(), minimalStake: wei(2) };
      await distribution.createPool(pool);
      await expect(distribution.stake(1, wei(1), 0)).to.be.revertedWith('DS: amount too low');
    });
    it('should revert if amount is equal zero', async () => {
      await expect(distribution.stake(poolId, 0, 0)).to.be.revertedWith('DS: nothing to stake');
    });
    it('should revert if claimLockEnd is less than previous one', async () => {
      await distribution.stake(poolId, wei(1), 2 * oneDay);

      await expect(distribution.stake(poolId, wei(1), oneDay)).to.be.revertedWith('DS: invalid claim lock end');
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
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      const tx = await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await expect(tx).to.emit(distribution, 'UserClaimed').withArgs(poolId, SECOND.address, SECOND.address, wei(198));

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(198));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(294));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(570));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      // Deposit 1 day after the start of reward payment
      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(wei(100));

      // Claim after 1.5 days
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(2));
      expect(userData.virtualDeposited).to.eq(wei(2));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 4 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(149));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(239));

      // Claim after 5.25 days
      await setNextTime(oneDay + oneDay * 5.25);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(149 + 353.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, one user, join after start', async () => {
      await setNextTime(oneDay + oneDay);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(98));
      const userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, without redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

      // Claim after 2 days
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 1 day
      await setNextTime(oneDay + oneDay * 3);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72), wei(0.01));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);

      // Claim after 3 days
      await setNextTime(oneDay + oneDay * 6);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5 + 72 + 207), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(124.5 + 24 + 69), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2), 0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4), 0);

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim, few users, with redeposits', async () => {
      let userData;

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

      // Deposit 1.5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 1.5);
      await distribution.connect(SECOND).stake(poolId, wei(2), 0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(wei(100 + 12.25));

      // Claim after 2 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 2);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 12.25 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      // Deposit 5 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 5);
      await distribution.connect(OWNER).stake(poolId, wei(4), 0);

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.closeTo(wei(141), wei(0.001));

      // Claim after 7 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 7);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(36.75 + 24.5 + 141 + 124.6), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(7));
      expect(userData.virtualDeposited).to.eq(wei(7));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(
        wei(100 + 12.25 + 24.5 + 141 + 53.4),
        wei(0.000001),
      );
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly claim zero reward when poll reward is zero', async () => {
      let userData;

      const newPool = {
        ...getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

      await setNextTime(oneDay + oneDay * 2);
      await distribution.editPool(poolId, newPool);

      // Claim after 3 days after the start of reward payment
      await setNextTime(oneDay + oneDay * 4);
      await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(73.5), wei(0.001));
      userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(3));
      expect(userData.virtualDeposited).to.eq(wei(3));
      expect(userData.pendingRewards).to.eq(0);

      expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(100 + 24.5), wei(0.000001));
      userData = await distribution.usersData(SECOND.address, poolId);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.virtualDeposited).to.eq(wei(1));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly continue claim reward after pool stop (zero reward)', async () => {
      let userData;

      const newPool = {
        ...getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

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
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

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

      await distribution.stake(poolId, wei(10), 0);

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

    describe('with multiplier', () => {
      const poolId = 0;
      const payoutStart = 1707393600;
      const periodStart = 1721908800;
      const claimLockEnd = periodStart + 300 * oneDay - 1;

      const newPool = {
        ...getDefaultPool(),
        payoutStart: payoutStart,
        initialReward: wei(10000),
        rewardDecrease: wei(1),
      };

      beforeEach(async () => {
        await setTime(payoutStart - 3 * oneDay);

        await distribution.editPool(poolId, newPool);
      });

      it('should correctly claim, one user, without redeposits', async () => {
        await distribution.connect(SECOND).stake(poolId, wei(1), 0);

        await setNextTime(periodStart + oneDay / 2);
        await distribution.connect(SECOND).lockClaim(poolId, claimLockEnd);

        const multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));

        await setTime(claimLockEnd);
        const tx = await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
        await expect(tx)
          .to.emit(distribution, 'UserClaimed')
          .withArgs(poolId, SECOND.address, SECOND.address, () => true);

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(4570722), wei(0.000001));
        const userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, with redeposits', async () => {
        let userData;

        await distribution.connect(SECOND).stake(poolId, wei(1), 0);

        await distribution.connect(SECOND).lockClaim(poolId, claimLockEnd);

        await setNextTime(periodStart + oneDay);
        await distribution.connect(SECOND).stake(poolId, wei(1), claimLockEnd);

        let multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(multiplier).to.gt(wei(1, 25));
        expect(await rewardToken.balanceOf(SECOND.address)).to.eq(wei(0));
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq((wei(2) * multiplier) / PRECISION);

        await setTime(claimLockEnd);
        await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

        multiplier = await distribution.getCurrentUserMultiplier(poolId, SECOND);
        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(4570722), wei(0.000001));
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(2));
        expect(userData.virtualDeposited).to.eq(wei(2));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, one user, join after start', async () => {
        await setNextTime(periodStart + oneDay);
        await distribution.connect(SECOND).stake(poolId, wei(1), 0);

        await distribution.connect(SECOND).lockClaim(poolId, claimLockEnd);

        await setTime(claimLockEnd);
        await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });

        expect(await rewardToken.balanceOf(SECOND.address)).to.be.closeTo(wei(2894918), wei(0.000001));
        const userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
      it('should correctly claim, few users, without redeposits', async () => {
        let userData;

        await distribution.connect(SECOND).stake(poolId, wei(1), 0);
        await distribution.connect(SECOND).lockClaim(poolId, claimLockEnd);

        await setNextTime(periodStart);
        await distribution.connect(OWNER).stake(poolId, wei(3), 0);
        await distribution.connect(OWNER).lockClaim(poolId, claimLockEnd);

        await setTime(claimLockEnd);
        await distribution.connect(SECOND).claim(poolId, SECOND, { value: wei(0.5) });
        await distribution.claim(poolId, OWNER, { value: wei(0.5) }); // The reward will be slightly larger since the calculation is a second later.

        expect(await rewardToken.balanceOf(OWNER.address)).to.closeTo(wei(2904750 * 0.75), wei(0.1));
        userData = await distribution.usersData(OWNER.address, poolId);
        expect(userData.deposited).to.eq(wei(3));
        expect(userData.virtualDeposited).to.eq(wei(3));
        expect(userData.pendingRewards).to.eq(0);

        expect(await rewardToken.balanceOf(SECOND.address)).to.closeTo(wei(1665972 + 2904750 * 0.25), wei(0.1));
        userData = await distribution.usersData(SECOND.address, poolId);
        expect(userData.deposited).to.eq(wei(1));
        expect(userData.virtualDeposited).to.eq(wei(1));
        expect(userData.pendingRewards).to.eq(0);
      });
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.connect(SECOND).claim(1, SECOND)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1), 0);

      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith('DS: pool claim is locked');
    });
    it('should revert if nothing to claim', async () => {
      const newPool = {
        ...getDefaultPool(),
        initialReward: 0,
      };

      await setNextTime(oneHour * 2);
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneHour * 3);
      await distribution.editPool(poolId, newPool);

      await setNextTime(oneDay + oneDay);
      await expect(distribution.connect(SECOND).claim(poolId, SECOND)).to.be.revertedWith('DS: nothing to claim');
    });
    it('should revert if personal claim is locked', async () => {
      await distribution.stake(poolId, wei(1), 0);
      await distribution.lockClaim(poolId, oneDay + oneDay);

      await setNextTime(oneDay + oneDay);
      await expect(distribution.claim(poolId, OWNER)).to.be.revertedWith('DS: user claim is locked');
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
      await distribution.connect(COMMUNITY).stake(poolId, wei(24), 0);
      await distribution.connect(CODERS).stake(poolId, wei(24), 0);
      await distribution.connect(COMPUTE).stake(poolId, wei(24), 0);
      await distribution.connect(CAPITAL).stake(poolId, wei(24), 0);
      await distribution.connect(PROTECTION).stake(poolId, wei(4), 0);

      await distribution.connect(COMMUNITY).stake(1, wei(1), 0);

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
      await distribution.connect(SECOND).stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(3), 0);

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
      await distribution.connect(SECOND).stake(poolId, wei(4), 0);

      await setNextTime(oneDay + oneDay);
      await distribution.connect(OWNER).stake(poolId, wei(6), 0);

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
      await distribution.connect(OWNER).stake(poolId, wei(4), 0);

      await setNextTime(oneHour * 3);
      await distribution.connect(OWNER).withdraw(poolId, wei(4));

      expect(await depositToken.balanceOf(OWNER.address)).to.eq(wei(1000));
      expect(await rewardToken.balanceOf(OWNER.address)).to.eq(0);
      const userData = await distribution.usersData(OWNER.address, poolId);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.pendingRewards).to.eq(0);
    });
    it('should correctly withdraw, when not enough tokens', async () => {
      await distribution.stake(poolId, wei(10), 0);
      await distribution.connect(SECOND).stake(poolId, wei(10), 0);
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
      await distribution.stake(poolId, wei(10), 0);

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
      await distribution.stake(poolId, wei(1), 0);

      await setNextTime(oneDay + oneDay * 2);

      await expect(distribution.withdraw(poolId, wei(0.99))).to.be.revertedWith('DS: invalid withdraw amount');
    });
    it('should revert if pool is private', async () => {
      const pool = { ...getDefaultPool(), isPublic: false, payoutStart: (await getCurrentBlockTime()) + 2 };
      await distribution.createPool(pool);
      await expect(distribution.withdraw(1, wei(1))).to.be.revertedWith("DS: pool isn't public");
    });
    it("should not revert if `withdrawLockPeriod` didn't pass, but the pool haven`t started", async () => {
      await distribution.stake(poolId, wei(10), 0);

      await expect(distribution.withdraw(poolId, wei(1))).to.be.not.reverted;
    });
    it("should revert if `withdrawLockPeriod` didn't pass", async () => {
      await distribution.stake(poolId, wei(1), 0);

      await setNextTime(oneDay);

      await expect(distribution.withdraw(poolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
    it("should revert if `withdrawLockPeriodAfterStake didn't pass", async () => {
      await setNextTime(oneDay * 10);

      await distribution.stake(poolId, wei(1), 0);

      await expect(distribution.withdraw(poolId, wei(0.1))).to.be.revertedWith('DS: pool withdraw is locked');
    });
  });

  describe('#lockClaim', () => {
    const poolId = 0;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;
    const claimLockEnd = periodStart + 300 * oneDay;

    beforeEach(async () => {
      const pool = {
        ...getDefaultPool(),
        payoutStart: payoutStart,
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
      };

      await distribution.createPool(pool);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should lock claim correctly in the public pool', async () => {
      await distribution.stake(poolId, wei(10), 0);

      const initialTime = await getCurrentBlockTime();

      let userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

      await setNextTime(periodStart + oneDay);

      const tx = await distribution.lockClaim(poolId, claimLockEnd);
      await expect(tx).to.emit(distribution, 'UserClaimLocked').withArgs(poolId, OWNER, initialTime, claimLockEnd);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.gt(wei(10));
      expect(userData.rate).to.gt(0);
      expect(userData.pendingRewards).to.gt(0);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd);

      const poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.gt(wei(1));
      expect(poolData.rate).to.gt(0);
      expect(await distribution.totalDepositedInPublicPools()).to.eq(wei(10));

      await setTime(claimLockEnd);

      await distribution.lockClaim(poolId, claimLockEnd * 2);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

      await setTime(claimLockEnd * 2);
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      await distribution.lockClaim(poolId, claimLockEnd * 3);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 3);
    });
    it('should lock claim correctly in the private pool', async () => {
      const poolPrivate = { ...getDefaultPool(), isPublic: false, payoutStart: (await getCurrentBlockTime()) + 2 };
      await distribution.createPool(poolPrivate);
      const poolId = 1;

      await distribution.manageUsersInPrivatePool(poolId, [OWNER], [wei(10)], [0]);

      const initialTime = await getCurrentBlockTime();

      let userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(await getCurrentBlockTime());

      await setNextTime(periodStart + oneDay);

      const tx = await distribution.lockClaim(poolId, claimLockEnd);
      await expect(tx).to.emit(distribution, 'UserClaimLocked').withArgs(poolId, OWNER, initialTime, claimLockEnd);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.deposited).to.eq(wei(10));
      expect(userData.virtualDeposited).to.gt(wei(10));
      expect(userData.rate).to.gt(0);
      expect(userData.pendingRewards).to.gt(0);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd);

      const poolData = await distribution.poolsData(poolId);
      expect(poolData.lastUpdate).to.eq(await getCurrentBlockTime());
      expect(poolData.totalVirtualDeposited).to.gt(wei(1));
      expect(poolData.rate).to.gt(0);

      await setTime(claimLockEnd);

      await distribution.lockClaim(poolId, claimLockEnd * 2);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(initialTime);
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 2);

      await setTime(claimLockEnd * 2);
      await distribution.claim(poolId, OWNER, { value: wei(0.5) });

      await distribution.lockClaim(poolId, claimLockEnd * 3);
      userData = await distribution.usersData(OWNER, poolId);
      expect(userData.claimLockStart).to.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.eq(claimLockEnd * 3);
    });
    it("should revert if pool doesn't exist", async () => {
      await expect(distribution.lockClaim(1, 1)).to.be.revertedWith("DS: pool doesn't exist");
    });
    it('should revert if claimLockEnd < block.timestamp', async () => {
      await distribution.stake(poolId, wei(10), 0);

      await setNextTime(periodStart + oneDay);

      await expect(distribution.lockClaim(poolId, periodStart - 1)).to.be.revertedWith(
        'DS: invalid lock end value (1)',
      );
    });
    it('should revert if claimLockEnd less then previous lock end', async () => {
      await distribution.stake(poolId, wei(10), claimLockEnd);

      await expect(distribution.lockClaim(poolId, claimLockEnd - 1)).to.be.revertedWith(
        'DS: invalid lock end value (2)',
      );
    });
    it('should revert if user is not staked', async () => {
      await expect(distribution.lockClaim(poolId, (await getCurrentBlockTime()) + 2)).to.be.revertedWith(
        "DS: user isn't staked",
      );
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
      await distribution.stake(poolId, wei(2), 0);

      await setTime(oneDay);

      const reward = await distribution.getCurrentUserReward(poolId, OWNER);

      expect(reward).to.eq(0);
    });
    it('should correctly calculate distribution rewards for 1 user', async () => {
      await distribution.stake(poolId, wei(2), 0);
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
      await distribution.stake(poolId, wei(1), 0);

      await setTime(oneDay + oneDay * 8);
      reward = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(reward).to.eq(wei(86));
    });
    it('should correctly calculate distribution rewards if user staked with pool start', async () => {
      await distribution.stake(poolId, wei(2), 0);

      await setTime(oneDay);

      let rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      let rewardSecond = await distribution.connect(SECOND).getCurrentUserReward(poolId, OWNER);
      expect(rewardFirst).to.eq(0);
      expect(rewardSecond).to.eq(0);

      await setTime(oneDay + oneDay * 0.5);

      rewardFirst = await distribution.getCurrentUserReward(poolId, OWNER);
      expect(rewardFirst).to.eq(wei(50));

      await setNextTime(oneDay + oneDay);

      await distribution.connect(SECOND).stake(poolId, wei(3), 0);

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
      const pool: IDistributionV3.PoolStruct = {
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

      await distribution.stake(1, wei(1), 0);

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

  describe('#getClaimLockPeriodMultiplier', () => {
    const poolId = 0;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      const pool = {
        ...getDefaultPool(),
        payoutStart: payoutStart,
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
      };

      await distribution.createPool(pool);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate multiplier correctly', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(multiplier).to.be.closeTo(wei(7.234393096, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(poolId, 0, periodStart + 200 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.171513456, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if end > periodEnd_', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(poolId, 24000 * oneDay, 99999999 * oneDay);

      expect(multiplier).to.be.closeTo(wei(1.176529228, 25), wei(0.000001, 25));
    });
    it('should calculate multiplier if start < periodStart_ and end > periodEnd_', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(poolId, 0, 99999999 * oneDay);

      expect(multiplier).to.eq(wei(10.7, 25));
    });
    it('should return 1 if start >= end', async () => {
      let multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        periodStart + 2 * oneDay,
        periodStart + 1 * oneDay,
      );
      expect(multiplier).to.eq(wei(1, 25));

      multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        periodStart + 2 * oneDay,
        periodStart + 2 * oneDay,
      );
      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier >= 1', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        periodStart + 1 * oneDay,
        periodStart + 1 * oneDay + 1,
      );

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return multiplier <= 10.7', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        periodStart + 10 * oneDay,
        99999999 * oneDay,
      );

      expect(multiplier).to.eq(wei(10.7, 25));
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await distribution.getClaimLockPeriodMultiplier(1, 0, 1);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#getCurrentUserMultiplier', () => {
    const poolId = 0;
    const payoutStart = 1707393600;
    const periodStart = 1721908800;

    beforeEach(async () => {
      const pool = {
        ...getDefaultPool(),
        payoutStart: payoutStart,
        initialReward: wei(14400),
        rewardDecrease: wei(2.468994701),
      };

      await distribution.createPool(pool);

      await setTime(periodStart - 3 * oneDay);
    });

    it('should calculate multiplier correctly', async () => {
      await setNextTime(payoutStart + 365 * oneDay);
      await distribution.stake(poolId, wei(1), payoutStart + 1742 * oneDay);
      const multiplier = await distribution.getClaimLockPeriodMultiplier(
        poolId,
        payoutStart + 365 * oneDay,
        payoutStart + 1742 * oneDay,
      );

      expect(await distribution.getCurrentUserMultiplier(poolId, OWNER)).to.equal(multiplier);
    });
    it('should return 1 if pool is not exist', async () => {
      const multiplier = await distribution.getCurrentUserMultiplier(1, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
    it('should return 1 if user is not staked', async () => {
      const multiplier = await distribution.getCurrentUserMultiplier(poolId, OWNER);

      expect(multiplier).to.eq(wei(1, 25));
    });
  });

  describe('#overplus', () => {
    beforeEach(async () => {
      const pool = getDefaultPool();

      await distribution.createPool(pool);
      await distribution.createPool(pool);
    });
    it('should return 0 if deposit token is not changed', async () => {
      await distribution.stake(0, wei(1), 0);

      await setTime(oneDay * 9999);

      const overplus = await distribution.overplus();
      expect(overplus).to.eq(0);
    });
    it('should return 0 if deposited token decreased', async () => {
      await distribution.stake(0, wei(1), 0);

      await setTime(oneDay * 9999);

      await depositToken.setTotalPooledEther(wei(0.5));

      const overplus = await distribution.overplus();
      expect(overplus).to.eq(0);
    });
    it('should return overplus if deposited token increased', async () => {
      await distribution.stake(0, wei(1), 0);

      await depositToken.setTotalPooledEther((await depositToken.totalPooledEther()) * 2n);

      let overplus = await distribution.overplus();
      expect(overplus).to.eq(wei(1));

      await distribution.stake(1, wei(1), 0);

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

      await distribution.stake(1, wei(1), 0);

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
const _getRewardTokenFromPool = async (distribution: DistributionV3, amount: bigint, user: SignerWithAddress) => {
  const poolId = await _getNextPoolId(distribution);
  const pool: IDistributionV3.PoolStruct = {
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
  await distribution.connect(user).stake(poolId, wei(1), 0);
  await distribution.connect(user).withdraw(poolId, wei(1));
};

const _getNextPoolId = async (distribution: DistributionV3) => {
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

const _comparePoolStructs = (a: IDistributionV3.PoolStruct, b: IDistributionV3.PoolStruct): boolean => {
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

// npx hardhat test "test/capital-protocol/old/DistributionV3.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/old/DistributionV3.test.ts"

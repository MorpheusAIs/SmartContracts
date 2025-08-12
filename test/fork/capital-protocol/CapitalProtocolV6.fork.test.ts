import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../../helpers/reverter';

import {
  AavePoolMock,
  ChainLinkDataConsumer,
  DepositPool,
  DistributionV5,
  Distributor,
  ERC20Token,
  L1Sender,
  L1SenderV2,
  RewardPool,
  StETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setTime } from '@/test/helpers/block-helper';
import {
  deployChainLinkDataConsumer,
  deployDepositPoolMock,
  deployDistributor,
  deployERC20Token,
  deployRewardPool,
  deployUniswapSwapRouterMock,
} from '@/test/helpers/deployers';
import { oneDay } from '@/test/helpers/distribution-helper';

describe('CapitalProtocolV6 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let STETH_HOLDER: SignerWithAddress;
  let PUBLIC_POOL_USER_ADDRESS: SignerWithAddress;
  let PRIVATE_POOL_USER_ADDRESS: SignerWithAddress;

  let distributionV5: DistributionV5;
  let distributor: Distributor;
  let l1Sender: L1Sender;
  let l1SenderV2: L1SenderV2;
  let chainLinkDataConsumer: ChainLinkDataConsumer;
  let rewardPool: RewardPool;

  // https://etherscan.io/address/0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790
  const distributionV5Address = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
  // https://etherscan.io/address/0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84
  const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';
  // https://etherscan.io/address/0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
  const aavePoolAddress = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  // https://etherscan.io/address/0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6
  const aaveProtocolDataProvider = '0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6';

  const publicPoolUserAddress = '0x0302CB360862aB7A5670D5E9958E8766fA50418F';
  const privatePoolUserAddress = '0xe549A9c6429A021C4DAc675D18161953749c8786';

  //https://etherscan.io/address/0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753
  const stETHHolder = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  before(async () => {
    await createFork();

    [OWNER, BOB] = await ethers.getSigners();
    STETH_HOLDER = await ethers.getImpersonatedSigner(stETHHolder);
    PUBLIC_POOL_USER_ADDRESS = await ethers.getImpersonatedSigner(publicPoolUserAddress);
    PRIVATE_POOL_USER_ADDRESS = await ethers.getImpersonatedSigner(privatePoolUserAddress);

    await BOB.sendTransaction({ to: PUBLIC_POOL_USER_ADDRESS, value: wei(1) });
    await BOB.sendTransaction({ to: PRIVATE_POOL_USER_ADDRESS, value: wei(1) });

    distributionV5 = await getDeployedDistributionV5();
    l1Sender = await getDeployedL1Sender();

    await transferOwnership(l1Sender);
    await transferOwnership(distributionV5);

    chainLinkDataConsumer = await deployChainLinkDataConsumer();
    rewardPool = await deployAndSetupRewardPool(distributionV5);
    l1SenderV2 = await upgradeL1SenderToL1SenderV2();
    distributor = await deployDistributor(
      chainLinkDataConsumer,
      aavePoolAddress,
      aaveProtocolDataProvider,
      rewardPool,
      l1SenderV2,
    );

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#upgradeTo', () => {
    it('should correctly upgrade to the new version', async () => {
      const depositPool = await upgradeDistributionV5ToDepositPool();

      expect(await depositPool.version()).to.eq(7);
    });
    it('should to not change storage', async () => {
      const isNotUpgradeable = await distributionV5.isNotUpgradeable();
      const depositToken = await distributionV5.depositToken();
      const l1Sender = await distributionV5.l1Sender();
      const pool0 = await distributionV5.pools(0);
      const pool4 = await distributionV5.pools(4);
      const poolsData0 = await distributionV5.poolsData(0);
      const poolsData4 = await distributionV5.poolsData(4);
      const usersDataPublic = await distributionV5.usersData(publicPoolUserAddress, 0);
      const usersDataPrivate = await distributionV5.usersData(privatePoolUserAddress, 1);
      const totalDepositedInPublicPools = await distributionV5.totalDepositedInPublicPools();
      const poolsLimits0 = await distributionV5.poolsLimits(0);
      const poolsLimits4 = await distributionV5.poolsLimits(4);
      const referrerTiers01 = await distributionV5.referrerTiers(0, 1);
      const referrerTiers03 = await distributionV5.referrerTiers(0, 3);

      const depositPool = await upgradeDistributionV5ToDepositPool();

      expect(await depositPool.isNotUpgradeable()).to.eq(isNotUpgradeable);
      expect(await depositPool.depositToken()).to.eq(depositToken);
      expect(await depositPool.unusedStorage0()).to.eq(l1Sender);
      expect(await depositPool.unusedStorage1(0)).to.deep.eq(pool0);
      expect(await depositPool.unusedStorage1(4)).to.deep.eq(pool4);
      expect(await depositPool.rewardPoolsData(0)).to.deep.eq(poolsData0);
      expect(await depositPool.rewardPoolsData(4)).to.deep.eq(poolsData4);
      expect(await depositPool.usersData(publicPoolUserAddress, 0)).to.deep.eq(usersDataPublic);
      expect(await depositPool.usersData(privatePoolUserAddress, 1)).to.deep.eq(usersDataPrivate);
      expect(await depositPool.totalDepositedInPublicPools()).to.eq(totalDepositedInPublicPools);
      expect(await depositPool.unusedStorage2(0)).to.deep.eq(poolsLimits0);
      expect(await depositPool.unusedStorage2(4)).to.deep.eq(poolsLimits4);
      expect(await depositPool.referrerTiers(0, 1)).to.deep.eq(referrerTiers01);
      expect(await depositPool.referrerTiers(0, 3)).to.deep.eq(referrerTiers03);
    });
  });

  describe('#migrate', () => {
    it('should correctly migrate', async () => {
      const depositPool = await upgradeDistributionV5ToDepositPool();
      await migrate(depositPool);
    });
    it('should correctly stake, claim, withdraw after the migration, public pool', async () => {
      const depositPool = await upgradeDistributionV5ToDepositPool();
      await migrate(depositPool);

      const stETH = await getStETH(depositPool);
      await stETH.connect(STETH_HOLDER).transfer(PUBLIC_POOL_USER_ADDRESS, wei(1));

      await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);
      await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);

      await setTime((await getCurrentBlockTime()) + 100 * oneDay);
      await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).claim(0, PUBLIC_POOL_USER_ADDRESS, { value: wei(0.1) });
      await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).withdraw(0, wei(999));
    });
    it('should correctly stake, claim, withdraw after the migration, private pool', async () => {
      const depositPool = await upgradeDistributionV5ToDepositPool();
      await migrate(depositPool);

      await depositPool.manageUsersInPrivateRewardPool(1, [privatePoolUserAddress], [wei(100)], [0], [ZERO_ADDR]);

      await setTime((await getCurrentBlockTime()) + 100 * oneDay);
      await depositPool.connect(PRIVATE_POOL_USER_ADDRESS).claim(1, PRIVATE_POOL_USER_ADDRESS, { value: wei(0.1) });
    });
  });

  describe('#distributeRewards', () => {
    it('should distribute rewards with stETH, USDC, USDT, wBTC, cbBTC', async () => {
      const distributor_test = await deployDistributor(
        chainLinkDataConsumer,
        aavePoolAddress,
        aaveProtocolDataProvider,
        rewardPool,
        l1SenderV2,
      );

      const erc20Factory = await ethers.getContractFactory('ERC20Token');
      const localToken = await deployERC20Token();
      const pairs = [
        {
          pair: 'stETH/USD',
          depositPool: await deployDepositPoolMock(localToken, distributor_test),
          depositToken: erc20Factory.attach('0xae7ab96520de3a18e5e111b5eaab095312d7fe84') as ERC20Token,
          strategy: 0,
          feed: ['0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8'],
        },
        {
          pair: 'USDC/USD',
          depositPool: await deployDepositPoolMock(localToken, distributor_test),
          depositToken: erc20Factory.attach('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') as ERC20Token,
          strategy: 2,
          feed: ['0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6'],
        },
        {
          pair: 'USDT/USD',
          depositPool: await deployDepositPoolMock(localToken, distributor_test),
          depositToken: erc20Factory.attach('0xdac17f958d2ee523a2206206994597c13d831ec7') as ERC20Token,
          strategy: 2,
          feed: ['0x3E7d1eAB13ad0104d2750B8863b489D65364e32D'],
        },
        {
          pair: 'cbBTC/USD',
          depositPool: await deployDepositPoolMock(localToken, distributor_test),
          depositToken: erc20Factory.attach('0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf') as ERC20Token,
          strategy: 2,
          feed: ['0x2665701293fCbEB223D11A08D826563EDcCE423A'],
        },
        {
          pair: 'wBTC/BTC,BTC/USD',
          depositPool: await deployDepositPoolMock(localToken, distributor_test),
          depositToken: erc20Factory.attach('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599') as ERC20Token,
          strategy: 2,
          feed: ['0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'],
        },
      ];

      for (let i = 0; i < pairs.length; i++) {
        await chainLinkDataConsumer.updateDataFeeds([pairs[i].pair], [pairs[i].feed]);
        await distributor_test.addDepositPool(
          0,
          pairs[i].depositPool,
          pairs[i].depositToken,
          pairs[i].pair,
          pairs[i].strategy,
        );
      }

      // ADD YIELD
      const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      const weth = erc20Factory.attach(wethAddress) as ERC20Token;
      await weth.deposit({ value: wei(20) });

      // Swap wETH
      const uniswapRouter = await deployUniswapSwapRouterMock();
      // https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
      await uniswapRouter.setUniswapSwapRouter('0xE592427A0AEce92De3Edee1F18E0157C05861564');

      await weth.transfer(uniswapRouter, wei(20));
      // Receive stETH
      await pairs[0].depositToken.connect(STETH_HOLDER).transfer(OWNER, wei(1));
      // Receive USDC
      await uniswapRouter.swapExactInputSingle(wethAddress, pairs[1].depositToken, wei(1), 0, 500, OWNER);
      // Receive USDT
      await uniswapRouter.swapExactInputSingle(wethAddress, pairs[2].depositToken, wei(1), 0, 500, OWNER);
      // Receive cbBTC
      await uniswapRouter.swapExactInputSingle(wethAddress, pairs[4].depositToken, wei(5), 0, 500, uniswapRouter);
      await uniswapRouter.swapExactInputSingle(
        pairs[4].depositToken,
        pairs[3].depositToken,
        await pairs[4].depositToken.balanceOf(uniswapRouter),
        0,
        100,
        OWNER,
      );
      // Receive wBTC
      await uniswapRouter.swapExactInputSingle(wethAddress, pairs[4].depositToken, wei(5), 0, 500, OWNER);

      // Move yield to distributor
      const aavePool = (await ethers.getContractFactory('AavePoolMock')).attach(aavePoolAddress) as AavePoolMock;

      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].strategy == 0) {
          await pairs[i].depositToken.transfer(distributor_test, await pairs[i].depositToken.balanceOf(OWNER));
          expect(await pairs[i].depositToken.balanceOf(distributor_test)).greaterThan(0);
        } else {
          await pairs[i].depositToken.approve(aavePool, await pairs[i].depositToken.balanceOf(OWNER));
          await aavePool.supply(
            pairs[i].depositToken,
            await pairs[i].depositToken.balanceOf(OWNER),
            distributor_test,
            0,
          );
        }
      }

      await distributor_test.setRewardPoolLastCalculatedTimestamp(0, (await getCurrentBlockTime()) - 50 * oneDay);
      await distributor_test.distributeRewards(0);

      for (let i = 0; i < pairs.length; i++) {
        expect(await distributor_test.getDistributedRewards(0, pairs[i].depositPool)).greaterThan(0);
      }
    });
  });

  const createFork = async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: 22093000,
        },
      },
    ]);
  };

  const getDeployedDistributionV5 = async (): Promise<DistributionV5> => {
    const [lib1Factory, lib2Factory] = await Promise.all([
      ethers.getContractFactory('ReferrerLib'),
      ethers.getContractFactory('LinearDistributionIntervalDecrease'),
    ]);

    const [lib1, lib2] = await Promise.all([await lib1Factory.deploy(), await lib2Factory.deploy()]);

    const distributionV5Factory = await ethers.getContractFactory('DistributionV5', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib1.getAddress(),
        ReferrerLib: await lib2.getAddress(),
      },
    });

    const contract_ = distributionV5Factory.attach(distributionV5Address) as DistributionV5;

    return contract_;
  };

  const getDeployedL1Sender = async (): Promise<L1Sender> => {
    return (await ethers.getContractFactory('L1Sender')).attach(l1SenderAddress) as L1Sender;
  };

  const transferOwnership = async (contract: L1Sender | L1SenderV2 | DistributionV5) => {
    const owner = await ethers.getImpersonatedSigner(await contract.owner());
    await BOB.sendTransaction({ to: owner, value: wei(1) });
    await contract.connect(owner).transferOwnership(OWNER);
  };

  const deployAndSetupRewardPool = async (_distributionV5: DistributionV5): Promise<RewardPool> => {
    const newPools = [];

    for (let i = 0; i < 5; i++) {
      const pool = await _distributionV5.pools(i);
      newPools.push({
        payoutStart: pool.payoutStart,
        decreaseInterval: pool.decreaseInterval,
        initialReward: pool.initialReward,
        rewardDecrease: pool.rewardDecrease,
        isPublic: pool.isPublic,
      });
    }

    return deployRewardPool(newPools);
  };

  const upgradeL1SenderToL1SenderV2 = async (): Promise<L1SenderV2> => {
    const l1SenderV2Impl = await (await ethers.getContractFactory('L1SenderV2')).deploy();
    await l1Sender.upgradeTo(l1SenderV2Impl);
    const contract = l1SenderV2Impl.attach(l1Sender) as L1SenderV2;

    return contract;
  };

  const upgradeDistributionV5ToDepositPool = async (): Promise<DepositPool> => {
    const [lib1Factory, lib2Factory] = await Promise.all([
      ethers.getContractFactory('ReferrerLib'),
      ethers.getContractFactory('LockMultiplierMath'),
    ]);

    const [lib1, lib2] = await Promise.all([await lib1Factory.deploy(), await lib2Factory.deploy()]);

    const implFactory = await ethers.getContractFactory('DepositPool', {
      libraries: {
        ReferrerLib: await lib1.getAddress(),
        LockMultiplierMath: await lib2.getAddress(),
      },
    });

    const impl = await implFactory.deploy();

    await distributionV5.upgradeTo(impl);
    const contract = implFactory.attach(distributionV5) as DepositPool;

    return contract;
  };

  const setRewardPoolProtocolDetails = async (depositPool: DepositPool) => {
    for (let i = 0; i < 5; i++) {
      const pool = await depositPool.unusedStorage1(i);
      const withdrawLockPeriodAfterStake = pool.withdrawLockPeriodAfterStake;
      const minimalStake = pool.minimalStake;

      const poolLimits = await depositPool.unusedStorage2(i);
      const claimLockPeriodAfterStake = poolLimits.claimLockPeriodAfterStake;
      const claimLockPeriodAfterClaim = poolLimits.claimLockPeriodAfterClaim;

      await depositPool.setRewardPoolProtocolDetails(
        i,
        withdrawLockPeriodAfterStake,
        claimLockPeriodAfterStake,
        claimLockPeriodAfterClaim,
        minimalStake,
      );
    }
  };

  const getStETH = async (depositPool: DepositPool) => {
    const stETHAddress = await depositPool.depositToken();
    return (await ethers.getContractFactory('StETHMock')).attach(stETHAddress) as StETHMock;
  };

  const migrate = async (depositPool: DepositPool) => {
    const stETH = await getStETH(depositPool);
    const stETHBalanceDepositPool = await stETH.balanceOf(depositPool);
    const stETHTotalDepositedInPublicPools = await depositPool.totalDepositedInPublicPools();
    expect(stETHBalanceDepositPool).to.greaterThan(stETHTotalDepositedInPublicPools);

    //////////

    await chainLinkDataConsumer.updateDataFeeds(['USDC/USD'], [['0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6']]);
    await chainLinkDataConsumer.updateDataFeeds(['USDT/USD'], [['0x3E7d1eAB13ad0104d2750B8863b489D65364e32D']]);
    await chainLinkDataConsumer.updateDataFeeds(['cbBTC/USD'], [['0x2665701293fCbEB223D11A08D826563EDcCE423A']]);
    await chainLinkDataConsumer.updateDataFeeds(
      ['wBTC/BTC,BTC/USD'],
      [['0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c']],
    );
    await chainLinkDataConsumer.updateDataFeeds(['stETH/USD'], [['0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8']]);

    await l1SenderV2.setDistributor(distributor);

    //////////

    await distributor.addDepositPool(0, depositPool, stETH, 'stETH/USD', 0);
    await distributor.addDepositPool(1, depositPool, ZERO_ADDR, '', 1);
    await distributor.addDepositPool(2, depositPool, ZERO_ADDR, '', 1);
    await distributor.addDepositPool(3, depositPool, ZERO_ADDR, '', 1);
    await distributor.addDepositPool(4, depositPool, ZERO_ADDR, '', 1);

    await distributor.setRewardPoolLastCalculatedTimestamp(0, (await depositPool.rewardPoolsData(0)).lastUpdate);
    await distributor.setRewardPoolLastCalculatedTimestamp(1, (await depositPool.rewardPoolsData(1)).lastUpdate);
    await distributor.setRewardPoolLastCalculatedTimestamp(2, (await depositPool.rewardPoolsData(2)).lastUpdate);
    await distributor.setRewardPoolLastCalculatedTimestamp(3, (await depositPool.rewardPoolsData(3)).lastUpdate);
    await distributor.setRewardPoolLastCalculatedTimestamp(4, (await depositPool.rewardPoolsData(4)).lastUpdate);

    //////////

    await depositPool.setDistributor(distributor);
    await setRewardPoolProtocolDetails(depositPool);

    await depositPool.migrate(0);

    expect(await distributor.undistributedRewards()).to.eq(0);
    expect(await stETH.balanceOf(depositPool)).to.closeTo(wei(0), wei(0.00001));
  };
});

// npm run generate-types && npx hardhat test "test/fork/capital-protocol/CapitalProtocolV6.fork.test.ts"

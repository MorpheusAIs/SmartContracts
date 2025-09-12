/* eslint-disable @typescript-eslint/no-explicit-any */
import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  ChainLinkDataConsumer,
  ChainLinkDataConsumer__factory,
  DepositPool__factory,
  DistributionV5__factory,
  Distributor,
  Distributor__factory,
  ERC1967Proxy__factory,
  L1SenderV2__factory,
  L1Sender__factory,
  RewardPool,
  RewardPool__factory,
  StETHMock__factory,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

let chainLinkDataConsumerAddress = '';
let rewardPoolAddress = '';
let distributorAddress = '';
let depositPoolImplAddress = '';
let l1SenderV2ImplAddress = '';

let depositPoolWBTC = '';
let depositPoolWETH = '';
let depositPoolUSDC = '';
let depositPoolUSDT = '';

const distributionV5Address = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

const wBTCAddress = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const wETHAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DL
  // Deploy and setup new contracts (partially).
  await _step1(deployer);

  // TO BE CALLED BY MS
  // Upgrade existing contracts. Setup existed contracts.
  await _step2(deployer);

  // TO BE CALLED BY DL
  // Setup `Distributor` contract.
  await _step3(deployer);

  // TO BE CALLED BY MS
  // Migrate to v2.
  await _step4(deployer);

  // TO BE CALLED BY DL
  // Transfer ownership rights
  await _step5(deployer);

  // ONLY FOR TESTS
  // Test deployed v2 contracts
  await test(deployer);

  // TO BE CALLED BY DL
  // Deploy new `DepositPool` contracts
  await _step6(deployer);

  // TO BE CALLED BY MS
  // Add new `DepositPool` contracts to `Distributor`
  await _step7(deployer);
};

const _step1 = async (deployer: Deployer) => {
  const chainLinkDataConsumer = await _deployAndSetupChainLinkDataConsumer(deployer);
  chainLinkDataConsumerAddress = await chainLinkDataConsumer.getAddress();

  const rewardPool = await _deployAndSetupRewardPool(deployer);
  rewardPoolAddress = await rewardPool.getAddress();

  const distributor = await _deployAndSetupDistributor(deployer);
  distributorAddress = await distributor.getAddress();

  depositPoolImplAddress = await (await deployer.deploy(DepositPool__factory)).getAddress();
  l1SenderV2ImplAddress = await (await deployer.deploy(L1SenderV2__factory)).getAddress();
};

const _step2 = async (deployer: Deployer) => {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const distributionV5 = await deployer.deployed(DistributionV5__factory, distributionV5Address);
  await distributionV5.connect(ms).upgradeTo(depositPoolImplAddress);
  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);

  const l1Sender = await deployer.deployed(L1Sender__factory, l1SenderAddress);
  await l1Sender.connect(ms).upgradeTo(l1SenderV2ImplAddress);
  const l1SenderV2 = await deployer.deployed(L1SenderV2__factory, l1SenderAddress);

  await l1SenderV2.connect(ms).setDistributor(distributorAddress);
  const uniswapRouter = '0xE592427A0AEce92De3Edee1F18E0157C05861564'; // https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
  await l1SenderV2.connect(ms).setUniswapSwapRouter(uniswapRouter);
  await depositPoolStETH.connect(ms).setDistributor(distributorAddress);

  for (let i = 0; i < 5; i++) {
    const pool = await depositPoolStETH.unusedStorage1(i);
    const withdrawLockPeriodAfterStake = pool.withdrawLockPeriodAfterStake;
    const minimalStake = pool.minimalStake;

    const poolLimits = await depositPoolStETH.unusedStorage2(i);
    const claimLockPeriodAfterStake = poolLimits.claimLockPeriodAfterStake;
    const claimLockPeriodAfterClaim = poolLimits.claimLockPeriodAfterClaim;

    await depositPoolStETH
      .connect(ms)
      .setRewardPoolProtocolDetails(
        i,
        withdrawLockPeriodAfterStake,
        claimLockPeriodAfterStake,
        claimLockPeriodAfterClaim,
        minimalStake,
      );
  }
};

const _step3 = async (deployer: Deployer) => {
  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);

  // https://aave.com/docs/resources/addresses
  const aavePoolAddressProvider = '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e';
  const aavePoolDataProvider = '0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6';
  await distributor.Distributor_init(
    chainLinkDataConsumerAddress,
    aavePoolDataProvider,
    aavePoolAddressProvider,
    rewardPoolAddress,
    l1SenderAddress,
  );

  const aaveRewardsController = '0x8164cc65827dcfe994ab23944cbc90e0aa80bfcb';
  await distributor.setAaveRewardsController(aaveRewardsController);
  await distributor.setMinRewardsDistributePeriod(86400);

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const stETH = await depositPoolStETH.depositToken();

  await distributor.addDepositPool(0, depositPoolStETH, stETH, 'stETH/USD', 0);
  await distributor.addDepositPool(1, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(2, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(3, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(4, depositPoolStETH, ZERO_ADDR, '', 1);

  await distributor.setRewardPoolLastCalculatedTimestamp(0, (await depositPoolStETH.rewardPoolsData(0)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(1, (await depositPoolStETH.rewardPoolsData(1)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(2, (await depositPoolStETH.rewardPoolsData(2)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(3, (await depositPoolStETH.rewardPoolsData(3)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(4, (await depositPoolStETH.rewardPoolsData(4)).lastUpdate);
};

const _step4 = async (deployer: Deployer) => {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  await depositPoolStETH.connect(ms).migrate(0);
};

const _step5 = async (deployer: Deployer) => {
  const chainLinkDataConsumer = await deployer.deployed(ChainLinkDataConsumer__factory, chainLinkDataConsumerAddress);
  const rewardPool = await deployer.deployed(RewardPool__factory, rewardPoolAddress);
  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);

  await chainLinkDataConsumer.transferOwnership(msAddress);
  await rewardPool.transferOwnership(msAddress);
  await distributor.transferOwnership(msAddress);

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const stETH = await deployer.deployed(StETHMock__factory, await depositPoolStETH.depositToken());

  console.log(`Undistributed rewards. Expected: 0. Actual: ${await distributor.undistributedRewards()}`);
  console.log(`stETH DepositPool balance. Expected: 0. Actual: ${await stETH.balanceOf(depositPoolStETH)}`);
  console.log(`Distributor balance. Expected: 0. Actual: ${await stETH.balanceOf(distributor)}`);
};

const _step6 = async (deployer: Deployer) => {
  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const rewardPoolDetails = await depositPoolStETH.rewardPoolsProtocolDetails(0);

  const deployDepositPool = async (tokenAddress: string): Promise<string> => {
    const proxy = await deployer.deploy(ERC1967Proxy__factory, [depositPoolImplAddress, '0x'], {
      name: `DepositPool ${tokenAddress}`,
    });
    const depositPool = await deployer.deployed(DepositPool__factory, await proxy.getAddress());

    await depositPool.DepositPool_init(tokenAddress, distributorAddress);
    await depositPool.setRewardPoolProtocolDetails(
      0,
      rewardPoolDetails.withdrawLockPeriodAfterStake,
      rewardPoolDetails.claimLockPeriodAfterStake,
      rewardPoolDetails.claimLockPeriodAfterClaim,
      rewardPoolDetails.minimalStake,
    );
    await depositPool.migrate(0);
    await depositPool.transferOwnership(msAddress);

    return depositPool.getAddress();
  };

  depositPoolWBTC = await deployDepositPool(wBTCAddress);
  depositPoolWETH = await deployDepositPool(wETHAddress);
  depositPoolUSDC = await deployDepositPool(usdcAddress);
  depositPoolUSDT = await deployDepositPool(usdtAddress);
};

const _step7 = async (deployer: Deployer) => {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);

  await distributor.connect(ms).addDepositPool(0, depositPoolWBTC, wBTCAddress, 'wBTC/BTC,BTC/USD', 2);
  await distributor.connect(ms).addDepositPool(0, depositPoolWETH, wETHAddress, 'wETH/USD', 2);
  await distributor.connect(ms).addDepositPool(0, depositPoolUSDC, usdcAddress, 'USDC/USD', 2);
  await distributor.connect(ms).addDepositPool(0, depositPoolUSDT, usdtAddress, 'USDT/USD', 2);
};

const test = async (deployer: Deployer) => {
  const USER = await ethers.getImpersonatedSigner('0x063e2575Eb717CC4031a39726CFEB38096C9fa8a');

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const stETH = await deployer.deployed(StETHMock__factory, await depositPoolStETH.depositToken());

  await depositPoolStETH.connect(USER).claim(0, '0x063e2575Eb717CC4031a39726CFEB38096C9fa8a', { value: wei(0.0003) });
  await depositPoolStETH.connect(USER).withdraw(0, wei(999));

  await stETH.connect(USER).approve(distributorAddress, wei(10));
  await depositPoolStETH.connect(USER).stake(0, wei(10), 0, ZERO_ADDR);
};

const _deployAndSetupChainLinkDataConsumer = async (deployer: Deployer): Promise<ChainLinkDataConsumer> => {
  const impl = await deployer.deploy(ChainLinkDataConsumer__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: `ChainLinkDataConsumer Proxy`,
  });
  const contract = await deployer.deployed(ChainLinkDataConsumer__factory, await proxy.getAddress());

  await contract.ChainLinkDataConsumer_init();

  await contract.updateDataFeeds(
    ['USDC/USD', 'USDT/USD', 'wETH/USD', 'stETH/USD', 'wBTC/BTC,BTC/USD'],
    [
      ['0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6'],
      ['0x3E7d1eAB13ad0104d2750B8863b489D65364e32D'],
      ['0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'],
      ['0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8'],
      ['0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'],
    ],
    [[86400], [86400], [3600], [3600], [86400, 3600]], // https://data.chain.link/
  );

  return contract;
};

const _deployAndSetupRewardPool = async (deployer: Deployer): Promise<RewardPool> => {
  const distributionV5 = await deployer.deployed(DistributionV5__factory, distributionV5Address);
  const newPools = [];
  for (let i = 0; i < 5; i++) {
    const pool = await distributionV5.pools(i);
    newPools.push({
      payoutStart: pool.payoutStart,
      decreaseInterval: pool.decreaseInterval,
      initialReward: pool.initialReward,
      rewardDecrease: pool.rewardDecrease,
      isPublic: pool.isPublic,
    });
  }

  const impl = await deployer.deploy(RewardPool__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: `RewardPool Proxy`,
  });
  const contract = await deployer.deployed(RewardPool__factory, await proxy.getAddress());

  await contract.RewardPool_init(newPools);

  return contract;
};

const _deployAndSetupDistributor = async (deployer: Deployer): Promise<Distributor> => {
  const impl = await deployer.deploy(Distributor__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: `Distributor Proxy`,
  });
  const contract = await deployer.deployed(Distributor__factory, await proxy.getAddress());

  return contract;
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 1

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
const dlAddress = '0x040EF6Fb6592A70291954E2a6a1a8F320FF10626';

let chainLinkDataConsumerAddress = '0xd182263d06FDC463c96190005D6359CC3d3Bbc5e';
let rewardPoolAddress = '0xb7994dE339AEe515C9b2792831CD83f3C9D8df87';
let distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';
let depositPoolImplAddress = '0xdB10dAEF167eA2233Ba6811457dD24D676FbD670';
let l1SenderV2ImplAddress = '0x50e80ea310269C547b64CC8b8A606bE0Ec467D1F';

let depositPoolWBTC = '0xdE283F8309Fd1AA46c95d299f6B8310716277A42';
let depositPoolWETH = '0x9380d72aBbD6e0Cc45095A2Ef8c2CA87d77Cb384';
let depositPoolUSDC = '0x6cCE082851Add4c535352f596662521B4De4750E';
let depositPoolUSDT = '0x3B51989212BEdaB926794D6bf8e9E991218cf116';

const distributionV5Address = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

const wBTCAddress = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const wETHAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DL
  // Deploy and setup new contracts (partially).
  // await _step1(deployer);

  // // TO BE CALLED BY MS
  // // Upgrade existing contracts. Setup existed contracts.
  // await _step2(deployer);

  // TO BE CALLED BY DL
  // Setup `Distributor` contract.
  // await _step3(deployer);

  // TO BE CALLED BY MS
  // Migrate to v2.
  // await _step4(deployer);

  // ONLY FOR TESTS
  // Test deployed v2 contracts
  // await test(deployer);

  // TO BE CALLED BY DL
  // Deploy new `DepositPool` contracts
  // await _step5(deployer);

  // TO BE CALLED BY MS
  // Add new `DepositPool` contracts to `Distributor`
  await _step6(deployer);
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

  await depositPoolStETH.connect(ms).setDistributor(distributorAddress);
  for (let i = 0; i < 1; i++) {
    const pool = await depositPoolStETH.unusedStorage1(i);
    const withdrawLockPeriodAfterStake = pool.withdrawLockPeriodAfterStake;
    const minimalStake = pool.minimalStake;

    const poolLimits = await depositPoolStETH.unusedStorage2(i);
    const claimLockPeriodAfterStake = poolLimits.claimLockPeriodAfterStake;
    const claimLockPeriodAfterClaim = poolLimits.claimLockPeriodAfterClaim;

    console.log(
      `setRewardPoolProtocolDetails(${i}, ${withdrawLockPeriodAfterStake}, ${claimLockPeriodAfterStake}, ${claimLockPeriodAfterClaim}, ${minimalStake})`,
    );

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

  const l1Sender = await deployer.deployed(L1Sender__factory, l1SenderAddress);
  await l1Sender.connect(ms).upgradeTo(l1SenderV2ImplAddress);
  const l1SenderV2 = await deployer.deployed(L1SenderV2__factory, l1SenderAddress);

  await l1SenderV2.connect(ms).setDistributor(distributorAddress);
  const uniswapRouter = '0xE592427A0AEce92De3Edee1F18E0157C05861564'; // https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
  await l1SenderV2.connect(ms).setUniswapSwapRouter(uniswapRouter);
};

const _step3 = async (deployer: Deployer) => {
  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const stETH = await depositPoolStETH.depositToken();

  await distributor.addDepositPool(0, depositPoolStETH, stETH, 'stETH/USD', 0);
  await distributor.addDepositPool(1, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(2, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(3, depositPoolStETH, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(4, depositPoolStETH, ZERO_ADDR, '', 1);

  for (let i = 0; i < 5; i++) {
    await distributor.setRewardPoolLastCalculatedTimestamp(i, (await depositPoolStETH.rewardPoolsData(i)).lastUpdate);
  }
};

const _step4 = async (deployer: Deployer) => {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  await depositPoolStETH.connect(ms).migrate(0);
};

const _step5 = async (deployer: Deployer) => {
  const deployDepositPool = async (tokenAddress: string): Promise<string> => {
    const proxy = await deployer.deploy(
      ERC1967Proxy__factory,
      [
        depositPoolImplAddress,
        DepositPool__factory.createInterface().encodeFunctionData('DepositPool_init', [
          tokenAddress,
          distributorAddress,
        ]),
      ],
      {
        name: `DepositPool ${tokenAddress}`,
      },
    );
    const depositPool = await deployer.deployed(DepositPool__factory, await proxy.getAddress());

    await depositPool.setRewardPoolProtocolDetails(0, 604800, 7776000, 7776000, '10000000000000000');
    await depositPool.migrate(0);
    await depositPool.transferOwnership(msAddress);

    return depositPool.getAddress();
  };

  // depositPoolWBTC = await deployDepositPool(wBTCAddress);
  depositPoolWETH = await deployDepositPool(wETHAddress);
  depositPoolUSDC = await deployDepositPool(usdcAddress);
  depositPoolUSDT = await deployDepositPool(usdtAddress);
};

const _step6 = async (deployer: Deployer) => {
  // const dl = await ethers.getImpersonatedSigner(dlAddress);

  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);

  // await distributor.addDepositPool(0, depositPoolWBTC, wBTCAddress, 'wBTC/BTC,BTC/USD', 2);
  // await distributor.addDepositPool(0, depositPoolWETH, wETHAddress, 'wETH/USD', 2);
  // await distributor.addDepositPool(0, depositPoolUSDC, usdcAddress, 'USDC/USD', 2);
  // await distributor.addDepositPool(0, depositPoolUSDT, usdtAddress, 'USDT/USD', 2);

  await distributor.transferOwnership(msAddress);

  // Transfer ownership of `ChainLinkDataConsumer` and `RewardPool` to MS
  const chainLinkDataConsumer = await deployer.deployed(ChainLinkDataConsumer__factory, chainLinkDataConsumerAddress);
  const rewardPool = await deployer.deployed(RewardPool__factory, rewardPoolAddress);

  await chainLinkDataConsumer.transferOwnership(msAddress);
  await rewardPool.transferOwnership(msAddress);
};

const test = async (deployer: Deployer) => {
  const USER = await ethers.getImpersonatedSigner('0xDd2e76b5BF83Ea2B447e52f1371AcF10113330C4');

  const distributor = await deployer.deployed(Distributor__factory, distributorAddress);
  const depositPoolStETH = await deployer.deployed(DepositPool__factory, distributionV5Address);
  const stETH = await deployer.deployed(StETHMock__factory, await depositPoolStETH.depositToken());

  console.log(`Undistributed rewards. Expected: 0. Actual: ${await distributor.undistributedRewards()}`);
  console.log(`DepositPool stETH balance. Expected: ~ 0. Actual: ${await stETH.balanceOf(depositPoolStETH)}`);
  console.log(`Distributor stETH balance. Expected: > 0. Actual: ${await stETH.balanceOf(distributor)}`);

  await depositPoolStETH.connect(USER).claim(0, USER, { value: wei(0.0003) });
  await depositPoolStETH.connect(USER).withdraw(0, wei(999));

  await stETH.connect(USER).approve(distributorAddress, wei(10));
  await depositPoolStETH.connect(USER).stake(0, wei(10), 0, ZERO_ADDR);
};

const _deployAndSetupChainLinkDataConsumer = async (deployer: Deployer): Promise<ChainLinkDataConsumer> => {
  const impl = await deployer.deploy(ChainLinkDataConsumer__factory);
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [
      await impl.getAddress(),
      ChainLinkDataConsumer__factory.createInterface().encodeFunctionData('ChainLinkDataConsumer_init'),
    ],
    {
      name: `ChainLinkDataConsumer Proxy`,
    },
  );
  const contract = await deployer.deployed(ChainLinkDataConsumer__factory, await proxy.getAddress());

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
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await impl.getAddress(), RewardPool__factory.createInterface().encodeFunctionData('RewardPool_init', [newPools])],
    {
      name: `RewardPool Proxy`,
    },
  );
  const contract = await deployer.deployed(RewardPool__factory, await proxy.getAddress());

  return contract;
};

const _deployAndSetupDistributor = async (deployer: Deployer): Promise<Distributor> => {
  // https://aave.com/docs/resources/addresses
  const aavePoolAddressProvider = '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e';
  const aavePoolDataProvider = '0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6';
  const aaveRewardsController = '0x8164cc65827dcfe994ab23944cbc90e0aa80bfcb';

  const impl = await deployer.deploy(Distributor__factory);
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [
      await impl.getAddress(),
      Distributor__factory.createInterface().encodeFunctionData('Distributor_init', [
        chainLinkDataConsumerAddress,
        aavePoolDataProvider,
        aavePoolAddressProvider,
        rewardPoolAddress,
        l1SenderAddress,
      ]),
    ],
    {
      name: `Distributor Proxy`,
    },
  );
  const contract = await deployer.deployed(Distributor__factory, await proxy.getAddress());

  await contract.setAaveRewardsController(aaveRewardsController);
  await contract.setMinRewardsDistributePeriod(86400);

  return contract;
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 1
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 1 --network ethereum

/* eslint-disable @typescript-eslint/no-explicit-any */
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { AddressLike, Signer } from 'ethers';
import { ethers } from 'hardhat';

import { ZERO_ADDR } from './utils/constants';
import { wei } from './utils/utils';

import {
  ChainLinkDataConsumer,
  ChainLinkDataConsumer__factory,
  DepositPool,
  DepositPool__factory,
  DistributionV5__factory,
  Distributor,
  Distributor__factory,
  IRewardPool,
  L1SenderV2__factory,
  L1Sender__factory,
  RewardPool,
  RewardPool__factory,
  StETHMock__factory,
} from '@/generated-types/ethers';
import { getCurrentBlockTime, setTime } from '@/test/helpers/block-helper';
import { oneDay } from '@/test/helpers/distribution-helper';

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

let chainLinkDataConsumeAddress = '';
let distributorAddress = '';

let depositPoolImplementation = '';
let l1SenderV2Implementation = '';
let rewardPoolAddress = '';

const depositPoolAddress = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
const l1SenderV2Address = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';
const stETHAddress = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';

async function _deployChainLinkDataConsumer(deployer: Signer | HardhatEthersSigner) {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('ChainLinkDataConsumer', deployer as any),
    ethers.getContractFactory('ERC1967Proxy', deployer as any),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as ChainLinkDataConsumer;

  await contract.ChainLinkDataConsumer_init();

  await contract.updateDataFeeds(['USDC/USD'], [['0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6']]);
  await contract.updateDataFeeds(['USDT/USD'], [['0x3E7d1eAB13ad0104d2750B8863b489D65364e32D']]);
  await contract.updateDataFeeds(['wETH/USD'], [['0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419']]);
  await contract.updateDataFeeds(['cbBTC/USD'], [['0x2665701293fCbEB223D11A08D826563EDcCE423A']]);
  await contract.updateDataFeeds(
    ['wBTC/BTC,BTC/USD'],
    [['0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c']],
  );
  await contract.updateDataFeeds(['stETH/USD'], [['0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8']]);

  // TODO: DELETE THIS MOCK
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('USDC/USD'), 72000000);
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('USDT/USD'), 72000000);
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('wETH/USD'), 72000000);
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('cbBTC/USD'), 72000000);
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('wBTC/BTC,BTC/USD'), 72000000);
  await contract.setAllowedPriceUpdateDelay(await contract.getPathId('stETH/USD'), 72000000);

  return contract;
}

const _deployRewardPool = async (
  rewardPools: IRewardPool.RewardPoolStruct[],
  deployer: Signer | HardhatEthersSigner,
): Promise<RewardPool> => {
  const [lib1Factory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('LinearDistributionIntervalDecrease', deployer as any),
    ethers.getContractFactory('ERC1967Proxy', deployer as any),
  ]);

  const lib1 = await lib1Factory.deploy();

  const implFactory = await ethers.getContractFactory('RewardPool', {
    libraries: {
      LinearDistributionIntervalDecrease: await lib1.getAddress(),
    },
    signer: deployer as any,
  });

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as RewardPool;

  await contract.RewardPool_init(rewardPools);

  rewardPoolAddress = await contract.getAddress();

  return contract;
};

const _prepareDepositPool = async (deployer: Signer | HardhatEthersSigner): Promise<string> => {
  const [lib1Factory, lib2Factory] = await Promise.all([
    ethers.getContractFactory('ReferrerLib', deployer as any),
    ethers.getContractFactory('LockMultiplierMath', deployer as any),
  ]);

  const [lib1, lib2] = await Promise.all([await lib1Factory.deploy(), await lib2Factory.deploy()]);

  const implFactory = await ethers.getContractFactory('DepositPool', {
    libraries: {
      ReferrerLib: await lib1.getAddress(),
      LockMultiplierMath: await lib2.getAddress(),
    },
    signer: deployer as any,
  });

  const impl = await implFactory.deploy();
  const address = await impl.getAddress();

  return address;
};

// TO BE CALLED BY MS
const _upgradeDistributionV5ToDepositPool = async (
  impl: AddressLike,
  ms: Signer | HardhatEthersSigner,
): Promise<DepositPool> => {
  const distributionV5 = DistributionV5__factory.connect(depositPoolAddress, ms);

  await distributionV5.upgradeTo(impl);
  const contract = DepositPool__factory.connect(depositPoolAddress, ms);

  return contract;
};

async function _deployAndSetupRewardPool(deployer: Signer | HardhatEthersSigner) {
  const distributionV5 = DistributionV5__factory.connect(depositPoolAddress, deployer);
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

  const rewardPool = await _deployRewardPool(newPools, deployer);

  return rewardPool;
}

async function _prepareL1SenderV2(deployer: Signer | HardhatEthersSigner): Promise<string> {
  const l1SenderV2Impl = await (await ethers.getContractFactory('L1SenderV2', deployer as any)).deploy();

  const address = await l1SenderV2Impl.getAddress();

  return address;
}

// TO BE CALLED BY MS
async function _upgrade1SenderV2(l1SenderV2Impl: string, ms: Signer | HardhatEthersSigner) {
  const l1SenderV1 = L1Sender__factory.connect(l1SenderV2Address, ms);
  await l1SenderV1.upgradeTo(l1SenderV2Impl);
}

async function _deployDistributor(
  chainLinkDataConsumer: AddressLike,
  aavePool: AddressLike,
  aavePoolDataProvider: AddressLike,
  rewardPool: AddressLike,
  l1Sender: AddressLike,
  deployer: Signer | HardhatEthersSigner,
): Promise<Distributor> {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('Distributor', deployer as any),
    ethers.getContractFactory('ERC1967Proxy', deployer as any),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as Distributor;

  await contract.Distributor_init(chainLinkDataConsumer, aavePool, aavePoolDataProvider, rewardPool, l1Sender);

  return contract;
}

async function step1() {
  const deployer = (await ethers.getSigners())[0];

  const chainLinkDataConsumer = await _deployChainLinkDataConsumer(deployer);
  chainLinkDataConsumeAddress = await chainLinkDataConsumer.getAddress();
  console.log(`chainLinkDataConsumeAddress=${chainLinkDataConsumeAddress}`);

  const rewardPool = await _deployAndSetupRewardPool(deployer);
  rewardPoolAddress = await rewardPool.getAddress();
  console.log(`rewardPoolAddress=${rewardPoolAddress}`);

  depositPoolImplementation = await _prepareDepositPool(deployer);
  console.log(`depositPoolImplementation=${depositPoolImplementation}`);

  l1SenderV2Implementation = await _prepareL1SenderV2(deployer);
  console.log(`l1SenderV2Implementation=${l1SenderV2Implementation}`);
}

// TO BE CALLED BY MS
async function step2() {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  await _upgradeDistributionV5ToDepositPool(depositPoolImplementation, ms);
  console.log('Upgraded depositPoolImplementation to', depositPoolImplementation);
  await _upgrade1SenderV2(l1SenderV2Implementation, ms);
  console.log('Upgraded l1SenderV2Implementation to', l1SenderV2Implementation);
}

async function step3() {
  const deployer = (await ethers.getSigners())[0];

  const aavePoolAddress = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const aaveProtocolDataProvider = '0x497a1994c46d4f6C864904A9f1fac6328Cb7C8a6';
  const distributor = await _deployDistributor(
    chainLinkDataConsumeAddress,
    aavePoolAddress,
    aaveProtocolDataProvider,
    rewardPoolAddress,
    l1SenderV2Address,
    deployer,
  );
  distributorAddress = await distributor.getAddress();
  console.log('Deployed distributor to', distributorAddress);
}

// TO BE CALLED BY MS
async function step4() {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const l1SenderV2 = L1SenderV2__factory.connect(l1SenderV2Address, ms);
  const distributor = Distributor__factory.connect(distributorAddress, ms);

  await l1SenderV2.setDistributor(distributor);
  console.log('Set distributor to', distributorAddress);
}

async function step5() {
  const deployer = (await ethers.getSigners())[0];

  const distributor = Distributor__factory.connect(distributorAddress, deployer);
  const depositPool = DepositPool__factory.connect(depositPoolAddress, deployer);
  const stETH = StETHMock__factory.connect(stETHAddress, deployer);

  await distributor.addDepositPool(0, depositPool, stETH, 'stETH/USD', 0);
  await distributor.addDepositPool(1, depositPool, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(2, depositPool, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(3, depositPool, ZERO_ADDR, '', 1);
  await distributor.addDepositPool(4, depositPool, ZERO_ADDR, '', 1);
  console.log('Added deposit pools to distributor');

  await distributor.setRewardPoolLastCalculatedTimestamp(0, (await depositPool.rewardPoolsData(0)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(1, (await depositPool.rewardPoolsData(1)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(2, (await depositPool.rewardPoolsData(2)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(3, (await depositPool.rewardPoolsData(3)).lastUpdate);
  await distributor.setRewardPoolLastCalculatedTimestamp(4, (await depositPool.rewardPoolsData(4)).lastUpdate);
  console.log('Set reward pool last calculated timestamp');
}

// TO BE CALLED BY MS
async function step6() {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const distributor = Distributor__factory.connect(distributorAddress, ms);
  const depositPool = DepositPool__factory.connect(depositPoolAddress, ms);

  await depositPool.setDistributor(distributor);
  console.log('Set distributor to', distributorAddress);
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
  console.log('Set reward pool protocol details');

  await depositPool.migrate(0);
  console.log('Migrated deposit pool');
}

async function step7() {
  const deployer = (await ethers.getSigners())[0];

  const chainLinkDataConsumer = ChainLinkDataConsumer__factory.connect(chainLinkDataConsumeAddress, deployer);
  const rewardPool = RewardPool__factory.connect(rewardPoolAddress, deployer);
  const distributor = Distributor__factory.connect(distributorAddress, deployer);
  const depositPool = DepositPool__factory.connect(depositPoolAddress, deployer);
  const stETH = StETHMock__factory.connect(stETHAddress, deployer);

  await chainLinkDataConsumer.transferOwnership(msAddress);
  await rewardPool.transferOwnership(msAddress);
  await distributor.transferOwnership(msAddress);
  console.log('Transferred ownership to ms');

  console.log(`Expected=0; Actual=${await distributor.undistributedRewards()}`);
  console.log(`Expected=~0; Actual=${await stETH.balanceOf(depositPool)}`);
}

async function testStake() {
  const deployer = (await ethers.getSigners())[0];
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const STETH_HOLDER = await ethers.getImpersonatedSigner('0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753');
  const PUBLIC_POOL_USER_ADDRESS = await ethers.getImpersonatedSigner('0x0302cb360862ab7a5670d5e9958e8766fa50418f');
  const PRIVATE_POOL_USER_ADDRESS = await ethers.getImpersonatedSigner('0xe549A9c6429A021C4DAc675D18161953749c8786');

  await deployer.sendTransaction({ to: PUBLIC_POOL_USER_ADDRESS, value: wei(1) });
  await deployer.sendTransaction({ to: PRIVATE_POOL_USER_ADDRESS, value: wei(1) });

  const depositPool = DepositPool__factory.connect(depositPoolAddress, deployer);
  const stETH = StETHMock__factory.connect(stETHAddress, deployer);

  await stETH.connect(STETH_HOLDER).transfer(PUBLIC_POOL_USER_ADDRESS, wei(1));
  await stETH.connect(PUBLIC_POOL_USER_ADDRESS).approve(distributorAddress, wei(1));

  await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);
  await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);
  console.log('Stake works');

  await setTime((await getCurrentBlockTime()) + 100 * oneDay);
  await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).claim(0, PUBLIC_POOL_USER_ADDRESS, { value: wei(0.1) });
  console.log('Public pool claim works');
  await depositPool.connect(PUBLIC_POOL_USER_ADDRESS).withdraw(0, wei(999));
  console.log('Withdraw works');

  await depositPool
    .connect(ms)
    .manageUsersInPrivateRewardPool(1, ['0xe549A9c6429A021C4DAc675D18161953749c8786'], [wei(100)], [0], [ZERO_ADDR]);

  await setTime((await getCurrentBlockTime()) + 100 * oneDay);
  await depositPool.connect(PRIVATE_POOL_USER_ADDRESS).claim(1, PRIVATE_POOL_USER_ADDRESS, { value: wei(0.1) });
  console.log('Private pool claim works');
}

async function main() {
  await step1();
  // TO BE CALLED BY MS
  await step2();
  await step3();
  // TO BE CALLED BY MS
  await step4();
  await step5();
  // TO BE CALLED BY MS
  await step6();
  await step7();

  await testStake();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/CapitalProtocolV6-migration.ts --network localhost

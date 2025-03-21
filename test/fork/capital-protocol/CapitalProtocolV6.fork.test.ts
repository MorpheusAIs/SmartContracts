import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../../helpers/reverter';

import {
  ChainLinkDataConsumer,
  DepositPool,
  DistributionV5,
  Distributor,
  L1Sender,
  L1SenderV2,
  RewardPool,
  StETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setTime } from '@/test/helpers/block-helper';
import { deployChainLinkDataConsumer, deployDistributor, deployRewardPool } from '@/test/helpers/deployers';
import { oneDay } from '@/test/helpers/distribution-helper';

describe('CapitalProtocolV6 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let STETH_HOLDER: SignerWithAddress;
  let PUBLIC_POO_USER_ADDRESS: SignerWithAddress;
  let PRIVATE_POO_USER_ADDRESS: SignerWithAddress;

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
    PUBLIC_POO_USER_ADDRESS = await ethers.getImpersonatedSigner(publicPoolUserAddress);
    PRIVATE_POO_USER_ADDRESS = await ethers.getImpersonatedSigner(privatePoolUserAddress);

    await BOB.sendTransaction({ to: PUBLIC_POO_USER_ADDRESS, value: wei(1) });
    await BOB.sendTransaction({ to: PRIVATE_POO_USER_ADDRESS, value: wei(1) });

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

      expect(await depositPool.version()).to.eq(6);
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
      expect(await depositPool.l1Sender()).to.eq(l1Sender);
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
      await stETH.connect(STETH_HOLDER).transfer(PUBLIC_POO_USER_ADDRESS, wei(1));

      await depositPool.connect(PUBLIC_POO_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);
      await depositPool.connect(PUBLIC_POO_USER_ADDRESS).stake(0, wei(0.5), 0, ZERO_ADDR);

      await setTime((await getCurrentBlockTime()) + 100 * oneDay);
      await depositPool.connect(PUBLIC_POO_USER_ADDRESS).claim(0, PUBLIC_POO_USER_ADDRESS, { value: wei(0.1) });
      await depositPool.connect(PUBLIC_POO_USER_ADDRESS).withdraw(0, wei(999));
    });
    it('should correctly stake, claim, withdraw after the migration, private pool', async () => {
      const depositPool = await upgradeDistributionV5ToDepositPool();
      await migrate(depositPool);

      await depositPool.manageUsersInPrivateRewardPool(1, [privatePoolUserAddress], [wei(100)], [0], [ZERO_ADDR]);

      await setTime((await getCurrentBlockTime()) + 100 * oneDay);
      await depositPool.connect(PRIVATE_POO_USER_ADDRESS).claim(1, PRIVATE_POO_USER_ADDRESS, { value: wei(0.1) });
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

    await stETH.connect(STETH_HOLDER).transfer(distributor, 100);
    await depositPool.migrate(0);

    expect(await distributor.undistributedRewards()).to.eq(0);
    expect(await stETH.balanceOf(depositPool)).to.closeTo(wei(0), wei(0.00001));
  };
});

// npm run generate-types && npx hardhat test "test/fork/capital-protocol/CapitalProtocolV6.fork.test.ts"

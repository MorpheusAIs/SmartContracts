import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { assert } from 'console';
import { ethers } from 'hardhat';

import { getCurrentBlockTime, setNextTime, setTime } from '../helpers/block-helper';
import { oneDay } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { DistributionV3, DistributionV4 } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('DistributionV4 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let distribution: DistributionV4;

  const richAddress = '0xE74546162c7c58929b898575C378Fd7EC5B16998';

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 20732838,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [SECOND] = await ethers.getSigners();

    await SECOND.sendTransaction({ to: richAddress, value: wei(100) });

    const libFactory = await ethers.getContractFactory('LinearDistributionIntervalDecrease', OWNER);
    const lib = await libFactory.deploy();

    const DistributionV3Factory = await ethers.getContractFactory('DistributionV3', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const DistributionV4Factory = await ethers.getContractFactory('DistributionV4', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const DistributionV4Impl = await DistributionV4Factory.deploy();
    const distributionCurrent = DistributionV3Factory.attach(
      '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
    ) as DistributionV3;

    // Upgrade to V4
    const contractOwner = await ethers.getImpersonatedSigner(await distributionCurrent.owner());
    await SECOND.sendTransaction({ to: contractOwner, value: wei(100) });
    await distributionCurrent.connect(contractOwner).transferOwnership(OWNER);

    await distributionCurrent.upgradeTo(DistributionV4Impl);

    distribution = DistributionV4Factory.attach(distributionCurrent) as DistributionV4;
    assert((await distribution.version()) === 4n, 'Distribution should be upgraded to V4');

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('should not change previous layout', () => {
    it('should have the same fields', async () => {
      expect(await distribution.owner()).to.be.eq(OWNER.address);
      expect(await distribution.isNotUpgradeable()).to.be.eq(false);
      expect(await distribution.depositToken()).to.be.eq('0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84');
      expect(await distribution.totalDepositedInPublicPools()).to.be.eq('70266379327170986478160');

      const pool = await distribution.pools(0);
      expect(pool.payoutStart).to.be.eq('1707393600');
      expect(pool.decreaseInterval).to.be.eq('86400');
      expect(pool.withdrawLockPeriod).to.be.eq('604800');
      expect(pool.claimLockPeriod).to.be.eq('7776000');
      expect(pool.withdrawLockPeriodAfterStake).to.be.eq('604800');
      expect(pool.initialReward).to.be.eq('3456000000000000000000');
      expect(pool.rewardDecrease).to.be.eq('592558728240000000');
      expect(pool.minimalStake).to.be.eq('10000000000000000');
      expect(pool.isPublic).to.be.eq(true);
    });
    it('should have the same fields from V1', async () => {
      const userData = await distribution.usersData('0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', 0);
      expect(userData.lastStake).to.be.eq('1707393167');
      expect(userData.deposited).to.be.eq('10014168892344354');
      expect(userData.rate).to.be.eq('32003956152210102231154177');
      expect(userData.pendingRewards).to.be.eq('0');
      expect(userData.claimLockStart).to.be.eq('0');
      expect(userData.claimLockEnd).to.be.eq('0');
    });
  });

  describe('should correctly update claim lock period after stake', () => {
    it('should reset claim lock period after stake', async () => {
      await distribution.editPoolLimits(0, { claimLockPeriodAfterStake: 86400, claimLockPeriodAfterClaim: 3600 });
      const pool = await distribution.pools(0);
      expect(pool.payoutStart).to.be.eq('1707393600');
      expect(pool.decreaseInterval).to.be.eq('86400');
      expect(pool.withdrawLockPeriod).to.be.eq('604800');
      expect(pool.claimLockPeriod).to.be.eq('7776000');
      expect(pool.withdrawLockPeriodAfterStake).to.be.eq('604800');
      expect(pool.initialReward).to.be.eq('3456000000000000000000');
      expect(pool.rewardDecrease).to.be.eq('592558728240000000');
      expect(pool.minimalStake).to.be.eq('10000000000000000');
      expect(pool.isPublic).to.be.eq(true);
    });
    it('should lock claim after the stake and after the claim', async () => {
      const userPublicPool = await ethers.getImpersonatedSigner('0x819D7A3EB883D7a2F0b9e87561298E294C66c538');

      // Claim should be available
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x819D7A3EB883D7a2F0b9e87561298E294C66c538', { value: wei(0.1) });
      // Move in feature to skip time restrictions
      await setTime((await getCurrentBlockTime()) + 10 * oneDay);
      // Withdraw
      await distribution.connect(userPublicPool).withdraw(0, wei(999));
      // Stake again
      await distribution.connect(userPublicPool).stake(0, wei(0.3), 0);
      // Claim
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x819D7A3EB883D7a2F0b9e87561298E294C66c538', { value: wei(0.1) });

      // Set limits
      await distribution.editPoolLimits(0, { claimLockPeriodAfterStake: 3600, claimLockPeriodAfterClaim: 8400 });
      await expect(
        distribution
          .connect(userPublicPool)
          .claim(0, '0x819D7A3EB883D7a2F0b9e87561298E294C66c538', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: pool claim is locked (S)');

      await setTime((await getCurrentBlockTime()) + 3600);
      await expect(
        distribution
          .connect(userPublicPool)
          .claim(0, '0x819D7A3EB883D7a2F0b9e87561298E294C66c538', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: pool claim is locked (C)');

      // Move in feature to skip time restrictions
      await setTime((await getCurrentBlockTime()) + 86400);
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x819D7A3EB883D7a2F0b9e87561298E294C66c538', { value: wei(0.1) });
    });
    it('should lock claim, public pool from V1', async () => {
      const userPublicPool = await ethers.getImpersonatedSigner('0x6cC37e13ceD30689b86a10819282027cA6BD1CDD');

      let userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.lastStake).to.be.eq('1707393167');

      // Move in feature to skip time restrictions
      await setTime((await getCurrentBlockTime()) + 10 * oneDay);

      const claimLockEnd = (await getCurrentBlockTime()) + 1000 * oneDay;

      await distribution.connect(userPublicPool).lockClaim(0, claimLockEnd);
      userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.claimLockStart).to.be.eq(userData.claimLockStart);
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);

      // Withdraw should be available
      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      // Stake should be availalble
      await distribution.connect(userPublicPool).stake(0, wei(0.01001), 0);
      const claimLockStart = await getCurrentBlockTime();
      // Claim should be locked
      await expect(
        distribution
          .connect(userPublicPool)
          .claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.claimLockStart).to.be.eq(claimLockStart);
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
    it('should stake, claim and withdraw from V1', async () => {
      const userPublicPool = await ethers.getImpersonatedSigner('0x6cC37e13ceD30689b86a10819282027cA6BD1CDD');
      const claimLockEnd = (await getCurrentBlockTime()) + 1050 * oneDay;

      let userData = await distribution.usersData('0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', 0);
      expect(userData.lastStake).to.be.eq('1707393167');

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 1000 * oneDay);
      // Withdraw two times to check that nothing can't lock this proccess
      await distribution.connect(userPublicPool).withdraw(0, wei(0.000001));
      await distribution.connect(userPublicPool).withdraw(0, wei(0.000001));
      // Claim  two times to check that nothing can't lock this proccess
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', { value: wei(0.1) });
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', { value: wei(0.1) });

      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      // Stake again
      await distribution.connect(userPublicPool).stake(0, wei(0.01) + 5n, 0);
      // Withdraw should be locked, claim should be available
      await expect(distribution.connect(userPublicPool).withdraw(0, wei(1))).to.be.rejectedWith(
        'DS: pool withdraw is locked',
      );
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', { value: wei(0.1) });

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 20 * oneDay);
      await distribution.connect(userPublicPool).lockClaim(0, claimLockEnd);
      // Withdraw should be available
      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      // Stake should be availalble
      await distribution.connect(userPublicPool).stake(0, wei(0.01) + 5n, 0);
      // Claim should be locked
      await expect(
        distribution
          .connect(userPublicPool)
          .claim(0, '0x6cC37e13ceD30689b86a10819282027cA6BD1CDD', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.claimLockStart).to.be.eq('1814251658');
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
  });
});

// npx hardhat test "test/fork/DistributionV4.fork.test.ts"

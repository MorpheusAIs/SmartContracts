import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { assert } from 'console';
import { ethers } from 'hardhat';

import { getCurrentBlockTime, setNextTime, setTime } from '../helpers/block-helper';
import { oneDay } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { DistributionV2, DistributionV3 } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('DistributionV3 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let distribution: DistributionV3;

  const richAddress = '0xE74546162c7c58929b898575C378Fd7EC5B16998';
  const privatePoolAddress = '0xD8A5529690cDf546FDcF07D593947cE298d60C51';

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 20410720,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [SECOND] = await ethers.getSigners();

    await SECOND.sendTransaction({ to: richAddress, value: wei(100) });

    const libFactory = await ethers.getContractFactory('LinearDistributionIntervalDecrease', OWNER);
    const lib = await libFactory.deploy();

    const distributionV2Factory = await ethers.getContractFactory('DistributionV2', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const distributionV3Factory = await ethers.getContractFactory('DistributionV3', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const distributionV3Impl = await distributionV3Factory.deploy();
    const distributionCurrent = distributionV2Factory.attach(
      '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
    ) as DistributionV2;

    // Upgrade to V3
    const contractOwner = await ethers.getImpersonatedSigner(await distributionCurrent.owner());
    await SECOND.sendTransaction({ to: contractOwner, value: wei(100) });
    await distributionCurrent.connect(contractOwner).transferOwnership(OWNER);

    await distributionCurrent.upgradeTo(distributionV3Impl);

    distribution = distributionV3Factory.attach(distributionCurrent) as DistributionV3;

    assert((await distribution.version()) === 3n, 'Distribution should be upgraded to V3');

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
      expect(await distribution.totalDepositedInPublicPools()).to.be.eq('69026207225385529774111');

      const userData = await distribution.usersData('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', 0);
      expect(userData.lastStake).to.be.eq('1720556387');
      expect(userData.deposited).to.be.eq('2204999397059511088988');
      expect(userData.rate).to.be.eq('61164610988183998370746203');
      expect(userData.pendingRewards).to.be.eq('346937953407516779');
      expect(userData.claimLockStart).to.be.eq('1722189455');
      expect(userData.claimLockEnd).to.be.eq('1766984400');

      const poolData = await distribution.poolsData(0);
      expect(poolData.lastUpdate).to.be.eq('1722238055');
      expect(poolData.rate).to.be.eq('61396452804497746520531828');
      expect(poolData.totalVirtualDeposited).to.be.eq('81370365844257681938794');

      expect(await distribution.getCurrentUserReward(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7')).to.be.eq(
        '154127381555257188900',
      );
      expect(await distribution.getCurrentUserReward(1, privatePoolAddress)).to.be.eq('2684429557387413871409');
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

  describe('should correctly lock claim', () => {
    let userPublicPool: SignerWithAddress;
    let userPrivatePool: SignerWithAddress;

    before(async () => {
      userPublicPool = await ethers.getImpersonatedSigner('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7');
      userPrivatePool = await ethers.getImpersonatedSigner(privatePoolAddress);
    });

    it('should lock claim, public pool', async () => {
      let userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.lastStake).to.be.eq('1720556387');

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
      await distribution.connect(userPublicPool).stake(0, wei(1), 0);
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
      await distribution.connect(userPublicPool).stake(0, wei(0.01), 0);
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
    it('should lock claim, private pool', async () => {
      let userData = await distribution.usersData(userPrivatePool.address, 1);
      expect(userData.lastStake).to.be.eq('1712704127');

      // Move in feature to skip time restrictions
      await setTime((await getCurrentBlockTime()) + 10 * oneDay);

      const claimLockEnd = (await getCurrentBlockTime()) + 1000 * oneDay;

      await distribution.connect(userPrivatePool).lockClaim(1, claimLockEnd);
      userData = await distribution.usersData(userPrivatePool.address, 1);
      const claimLockStart = userData.claimLockStart;
      expect(userData.claimLockStart).to.be.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);

      // Claim should be locked
      await expect(
        distribution.connect(userPrivatePool).claim(1, privatePoolAddress, { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(userPrivatePool.address, 1);
      expect(userData.claimLockStart).to.be.eq(claimLockStart);
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
    it('should stake, claim and withdraw', async () => {
      const claimLockEnd = (await getCurrentBlockTime()) + 1050 * oneDay;

      let userData = await distribution.usersData('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', 0);
      expect(userData.lastStake).to.be.eq('1720556387');

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 1000 * oneDay);
      // Withdraw two times to check that nothing can't lock this proccess
      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      // Claim  two times to check that nothing can't lock this proccess
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });
      // Stake again
      await distribution.connect(userPublicPool).stake(0, wei(1), 0);
      // Withdraw should be locked, claim should be available
      await expect(distribution.connect(userPublicPool).withdraw(0, wei(1))).to.be.rejectedWith(
        'DS: pool withdraw is locked',
      );
      await distribution
        .connect(userPublicPool)
        .claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 20 * oneDay);
      await distribution.connect(userPublicPool).lockClaim(0, claimLockEnd);
      // Withdraw should be available
      await distribution.connect(userPublicPool).withdraw(0, wei(1));
      // Stake should be availalble
      await distribution.connect(userPublicPool).stake(0, wei(1), 0);
      // Claim should be locked
      await expect(
        distribution
          .connect(userPublicPool)
          .claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(userPublicPool.address, 0);
      expect(userData.claimLockStart).to.be.eq('1810366069');
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
      expect(userData.claimLockStart).to.be.eq('1810366070');
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
  });
});

// npx hardhat test "test/fork/DistributionV3.fork.test.ts"

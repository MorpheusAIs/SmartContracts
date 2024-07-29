import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { assert } from 'console';
import { ethers } from 'hardhat';

import { getCurrentBlockTime, setNextTime, setTime } from '../helpers/block-helper';
import { oneDay } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { Distribution, DistributionV2 } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('DistributionV2 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let distribution: DistributionV2;

  const richAddress = '0xE74546162c7c58929b898575C378Fd7EC5B16998';

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 20270072,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [SECOND] = await ethers.getSigners();

    await SECOND.sendTransaction({ to: richAddress, value: wei(100) });

    const libFactory = await ethers.getContractFactory('LinearDistributionIntervalDecrease', OWNER);
    const lib = await libFactory.deploy();

    const distributionFactory = await ethers.getContractFactory('Distribution', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const distributionV2Factory = await ethers.getContractFactory('DistributionV2', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
      signer: OWNER,
    });
    const distributionV2Impl = await distributionV2Factory.deploy();
    const distributionCurrent = distributionFactory.attach(
      '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
    ) as Distribution;

    // Upgrade to V2
    const contractOwner = await ethers.getImpersonatedSigner(await distributionCurrent.owner());
    await SECOND.sendTransaction({ to: contractOwner, value: wei(100) });
    await distributionCurrent.connect(contractOwner).transferOwnership(OWNER);

    await distributionCurrent.upgradeTo(distributionV2Impl);

    distribution = distributionV2Factory.attach(distributionCurrent) as DistributionV2;

    assert((await distribution.version()) === 2n, 'Distribution should be upgraded to V2');

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
      expect(await distribution.totalDepositedInPublicPools()).to.be.eq('71907980495998572259078');

      const userData = await distribution.usersData('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', 0);
      expect(userData.lastStake).to.be.eq('1720439015');
      expect(userData.deposited).to.be.eq('2139986147504468919117');
      expect(userData.rate).to.be.eq('51630140467320310474657151');
      expect(userData.pendingRewards).to.be.eq('267534152514009588478');
      expect(userData.claimLockStart).to.be.eq('0');
      expect(userData.claimLockEnd).to.be.eq('0');

      const poolData = await distribution.poolsData(0);
      expect(poolData.lastUpdate).to.be.eq('1720539707');
      expect(poolData.rate).to.be.eq('52175778470982772508060350');
      expect(poolData.totalVirtualDeposited).to.be.eq('71907980495998572259078');

      expect(await distribution.getCurrentUserReward(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7')).to.be.eq(
        '386755493702019514016',
      );
    });
  });

  describe('should correctly lock claim', () => {
    let user: SignerWithAddress;

    before(async () => {
      user = await ethers.getImpersonatedSigner('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7');
    });

    it('should lock claim', async () => {
      let userData = await distribution.usersData(user.address, 0);
      expect(userData.lastStake).to.be.eq('1720439015');

      // Move in feature to skip time restrictions
      await setTime((await getCurrentBlockTime()) + 10 * oneDay);

      const claimLockEnd = (await getCurrentBlockTime()) + 500 * oneDay;

      await distribution.connect(user).lockClaim(0, claimLockEnd);
      userData = await distribution.usersData(user.address, 0);
      expect(userData.claimLockStart).to.be.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);

      // Withdraw should be available
      await distribution.connect(user).withdraw(0, wei(1));
      // Stake should be availalble
      await distribution.connect(user).stake(0, wei(1), 0);
      const claimLockStart = await getCurrentBlockTime();
      // Claim should be locked
      await expect(
        distribution.connect(user).claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(user.address, 0);
      expect(userData.claimLockStart).to.be.eq(claimLockStart);
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
    it('should stake, claim and withdraw', async () => {
      const claimLockEnd = (await getCurrentBlockTime()) + 500 * oneDay;

      let userData = await distribution.usersData('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', 0);
      expect(userData.lastStake).to.be.eq('1720439015');

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 10 * oneDay);
      // Withdraw two times to check that nothing can't lock this proccess
      await distribution.connect(user).withdraw(0, wei(1));
      await distribution.connect(user).withdraw(0, wei(1));
      // Claim  two times to check that nothing can't lock this proccess
      await distribution.connect(user).claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });
      await distribution.connect(user).claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });
      // Stake again
      await distribution.connect(user).stake(0, wei(1), 0);
      // Withdraw should be locked, claim should be available
      await expect(distribution.connect(user).withdraw(0, wei(1))).to.be.rejectedWith('DS: pool withdraw is locked');
      await distribution.connect(user).claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) });

      // Move in feature to skip time restrictions
      await setNextTime((await getCurrentBlockTime()) + 20 * oneDay);
      await distribution.connect(user).lockClaim(0, claimLockEnd);
      // Withdraw should be available
      await distribution.connect(user).withdraw(0, wei(1));
      // Stake should be availalble
      await distribution.connect(user).stake(0, wei(1), 0);
      // Claim should be locked
      await expect(
        distribution.connect(user).claim(0, '0x473FFa6AB954a7A003C554eeA90153DADB05a4E7', { value: wei(0.1) }),
      ).to.be.rejectedWith('DS: user claim is locked');

      userData = await distribution.usersData(user.address, 0);
      expect(userData.claimLockStart).to.be.eq('1723133833');
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
  });
});

// npx hardhat test "test/fork/DistributionV2.fork.test.ts"

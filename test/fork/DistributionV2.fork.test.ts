import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { assert } from 'console';
import { ethers } from 'hardhat';

import { getCurrentBlockTime } from '../helpers/block-helper';
import { oneDay } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { Distribution, DistributionV2 } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('L2TokenReceiverV2 Fork', () => {
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
    });
  });

  describe('should correctly lock claim', () => {
    let user: SignerWithAddress;

    before(async () => {
      user = await ethers.getImpersonatedSigner('0x473FFa6AB954a7A003C554eeA90153DADB05a4E7');
    });

    it('should lock claim old user', async () => {
      const claimLockEnd = (await getCurrentBlockTime()) + 500 * oneDay;
      await distribution.connect(user).lockClaim(0, claimLockEnd);

      const userData = await distribution.usersData(user.address, 0);
      expect(userData.claimLockStart).to.be.eq(await getCurrentBlockTime());
      expect(userData.claimLockEnd).to.be.eq(claimLockEnd);
    });
  });
});

// npx hardhat test "test/fork/DistributionV2.fork.test.ts"
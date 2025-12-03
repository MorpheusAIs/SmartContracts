import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { assert } from 'console';
import { ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';

import { BuildersTreasuryV2, BuildersV4, MOROFT } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime, setTime } from '@/test/helpers/block-helper';
import { deployRewardPool } from '@/test/helpers/deployers';
import { getRealRewardsPools } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('DistributionV5 Fork', () => {
  const reverter = new Reverter();

  // Base Mainnet
  const buildersV2Address = '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9';
  const buildersTreasuryAddress = '0x9eba628581896ce086cb8f1A513ea6097A8FC561';
  const moroftAddress = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';

  let OWNER: SignerWithAddress;

  let buildersV4: BuildersV4;
  let buildersTreasuryV2: BuildersTreasuryV2;
  let token: MOROFT;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: 32501690,
        },
      },
    ]);

    [OWNER] = await ethers.getSigners();

    const [buildersV4Factory, buildersTreasuryV2Factory, moroftFactory] = await Promise.all([
      ethers.getContractFactory('BuildersV4'),
      ethers.getContractFactory('BuildersTreasuryV2'),
      ethers.getContractFactory('MOROFT'),
    ]);

    const implBuildersV4 = await buildersV4Factory.deploy();
    const implBuildersTreasuryV2 = await buildersTreasuryV2Factory.deploy();

    buildersV4 = buildersV4Factory.attach(buildersV2Address) as BuildersV4;
    buildersTreasuryV2 = buildersTreasuryV2Factory.attach(buildersTreasuryAddress) as BuildersTreasuryV2;
    token = moroftFactory.attach(moroftAddress) as MOROFT;

    const buildersV2Owner = await ethers.getImpersonatedSigner(await buildersV4.owner());
    await OWNER.sendTransaction({ to: buildersV2Owner, value: wei(1) });
    await buildersV4.connect(buildersV2Owner).transferOwnership(OWNER);
    await buildersV4.upgradeTo(implBuildersV4);

    const buildersTreasuryV2Owner = await ethers.getImpersonatedSigner(await buildersTreasuryV2.owner());
    await OWNER.sendTransaction({ to: buildersTreasuryV2Owner, value: wei(1) });
    await buildersTreasuryV2.connect(buildersTreasuryV2Owner).transferOwnership(OWNER);
    await buildersTreasuryV2.upgradeTo(implBuildersTreasuryV2);

    assert((await buildersV4.version()) === 4n, 'BuildersV2 should be upgraded to V4');
    assert((await buildersTreasuryV2.version()) === 2n, 'buildersTreasury should be upgraded to V2');

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('BuildersV4', () => {
    it('should not change existed storage', async () => {
      expect(await buildersV4.feeConfig()).to.be.eq('0x845FBB4B3e2207BF03087b8B94D2430AB11088eE');
      expect(await buildersV4.depositToken()).to.be.eq('0x7431aDa8a591C955a994a21710752EF9b882b8e3');
      expect(await buildersV4.unusedStorage1_V4Update()).to.be.eq('86400');
      expect(await buildersV4.minimalWithdrawLockPeriod()).to.be.eq('604800');
      const allSubnetsData = await buildersV4.allSubnetsData();
      expect(allSubnetsData.unusedStorage1_V4Update).to.be.eq('76689500000000000000000');
      expect(allSubnetsData.rate).to.be.eq('3349716783889031947390129');
      expect(allSubnetsData.totalDeposited).to.be.eq('291248701078346066808927');
      expect(allSubnetsData.unusedStorage2_V4Update).to.be.eq('291252465492741924236507');

      let subnetId = await buildersV4.getSubnetIdOld('coincap');
      const subnet = await buildersV4.subnets(subnetId);
      expect(subnet.name).to.be.eq('coincap');
      expect(subnet.admin).to.be.eq('0x3B438cc593d579627089F0d99bc5f0BB5151c6Ce');
      expect(subnet.unusedStorage1_V4Update).to.be.eq('1737145300');
      expect(subnet.withdrawLockPeriodAfterDeposit).to.be.eq('604800');
      expect(subnet.unusedStorage2_V4Update).to.be.eq('0');
      expect(subnet.minimalDeposit).to.be.eq('1000000000000000');
      expect(subnet.claimAdmin).to.be.eq(ZeroAddress);

      subnetId = '0xf8c784db930f5b824609b2a64bc7135b089666624ba6e3a8cca427eafcf572cd';
      const subnetData = await buildersV4.subnetsData(subnetId);
      expect(subnetData.unusedStorage1_V4Update).to.be.eq('0');
      expect(subnetData.deposited).to.be.eq('2798616800000000000000');
      expect(subnetData.unusedStorage2_V4Update).to.be.eq('2798616800000000000000');
      expect(subnetData.rate).to.be.eq('3349716783889031947390129');
      expect(subnetData.pendingRewards).to.be.eq('352204834138186772735');
    });
    it('should be possible to stake, withdraw, claim', async () => {
      const rewardPool = await deployRewardPool(getRealRewardsPools());
      await buildersV4.setRewardPool(rewardPool);
      await buildersV4.setNetworkShare(wei(0.5, 25));

      const bob = await ethers.getImpersonatedSigner('0xCd8f007AAE316b15BAA10c650eDEB3fe08A75999');

      const subnetId = '0xc0aca3a0b3cfab81287943ef4a48e0c2f0441c12beb50fc8c2be3a810bbe0d6c';
      const receiver = '0xCd8f007AAE316b15BAA10c650eDEB3fe08A75999';

      await setTime((await getCurrentBlockTime()) + 1000);
      await buildersV4.connect(bob).claim(subnetId, receiver);

      await token.connect(bob).approve(buildersV4, wei(1));
      await buildersV4.connect(bob).deposit(subnetId, wei(1));

      await setTime((await getCurrentBlockTime()) + 1209600 + 1);
      await buildersV4.connect(bob).withdraw(subnetId, wei(1));
    });
  });

  describe('BuildersTreasuryV2', () => {
    it('should not change existed storage', async () => {
      expect(await buildersTreasuryV2.builders()).to.be.eq(buildersV2Address);
      expect(await buildersTreasuryV2.rewardToken()).to.be.eq('0x7431aDa8a591C955a994a21710752EF9b882b8e3');
      expect(await buildersTreasuryV2.distributedRewards()).to.be.eq('69651670862957789384542');
    });
  });
});

// npx hardhat test "test/fork/builder-protocol/BuilderV4.fork.test.ts"

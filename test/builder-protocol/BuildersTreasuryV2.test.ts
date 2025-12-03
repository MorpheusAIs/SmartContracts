import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import { getDefaultSubnetMetadata, getDefaultSubnetV4 } from '../helpers/builders-helper';
import {
  deployBuildersTreasuryV2,
  deployBuildersV4,
  deployFeeConfig,
  deployInterfaceMock,
  deployMOROFT,
  deployRewardPoolMock,
} from '../helpers/deployers';
import { Reverter } from '../helpers/reverter';

import { BuildersTreasuryV2, BuildersV4, MOROFT, RewardPoolMock } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('BuildersTreasuryV2', () => {
  const reverter = new Reverter();

  let builders: BuildersV4;
  let rewardPoolMock: RewardPoolMock;
  let buildersTreasury: BuildersTreasuryV2;
  let token: MOROFT;

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let NETWORK_SHARE_OWNER: SignerWithAddress;

  before(async () => {
    [OWNER, BOB, FEE_TREASURY, MINTER, NETWORK_SHARE_OWNER] = await ethers.getSigners();

    token = await deployMOROFT(101, OWNER, OWNER, MINTER);
    const feeConfig = await deployFeeConfig(FEE_TREASURY);
    buildersTreasury = await deployBuildersTreasuryV2(token);
    rewardPoolMock = await deployRewardPoolMock();
    builders = await deployBuildersV4(token, feeConfig, buildersTreasury, rewardPoolMock, NETWORK_SHARE_OWNER, 1000);

    await buildersTreasury.setBuilders(builders);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#BuildersTreasuryV2__init', () => {
      it('should set correct data after creation', async () => {
        const rewardToken = await buildersTreasury.rewardToken();
        expect(rewardToken).to.eq(await token.getAddress());
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(buildersTreasury.BuildersTreasuryV2_init(token)).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const implFactory = await ethers.getContractFactory('L1SenderMock');
        const impl = await implFactory.deploy();

        expect(await buildersTreasury.version()).to.eq(2);
        await buildersTreasury.upgradeTo(impl);
        expect(await buildersTreasury.version()).to.eq(666);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(buildersTreasury.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IBuildersTreasuryV2', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await buildersTreasury.supportsInterface(await interfaceMock.getIBuildersTreasuryV2())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await buildersTreasury.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setBuilders', () => {
    it('should set the builders', async () => {
      expect(await buildersTreasury.builders()).to.be.equal(await builders.getAddress());

      const feeConfig = await deployFeeConfig(FEE_TREASURY);
      const buildersV4 = await deployBuildersV4(
        token,
        feeConfig,
        buildersTreasury,
        rewardPoolMock,
        NETWORK_SHARE_OWNER,
        1000,
      );

      await buildersTreasury.setBuilders(buildersV4);
      expect(await buildersTreasury.builders()).to.be.equal(await buildersV4.getAddress());
    });
    it('should revert if provided address is not `BuildersV4`', async () => {
      await expect(buildersTreasury.setBuilders(rewardPoolMock)).to.be.revertedWith('BT: invalid `BuildersV4`');
    });
    it('should revert if caller is not the owner', async () => {
      await expect(buildersTreasury.connect(BOB).setBuilders(builders)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#withdraw', async () => {
    it('should withdraw thr tokens from the owner account', async () => {
      await token.connect(MINTER).mint(buildersTreasury, wei(10000));
      await buildersTreasury.withdraw(NETWORK_SHARE_OWNER, wei(4000));
      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 4000));
      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(4000));

      await buildersTreasury.withdraw(NETWORK_SHARE_OWNER, wei(6000));
      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(0));
      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(10000));
    });
    it('should revert if caller is not the builders', async () => {
      await expect(buildersTreasury.connect(BOB).withdraw(NETWORK_SHARE_OWNER, 1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if caller is not the builders', async () => {
      await expect(buildersTreasury.withdraw(ZERO_ADDR, 1)).to.be.revertedWith('BT: invalid receiver address');
    });
  });

  describe('#sendRewards', async () => {
    it('should send rewards', async () => {
      await token.connect(MINTER).mint(OWNER, wei(1000));
      await token.connect(MINTER).mint(BOB, wei(1000));
      await token.connect(MINTER).mint(buildersTreasury, wei(10000));
      await token.connect(OWNER).approve(builders, wei(1000));
      await token.connect(BOB).approve(builders, wei(1000));

      const subnet = { ...getDefaultSubnetV4(OWNER), name: '1' };
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.createSubnet(subnet, getDefaultSubnetMetadata());
      await builders.setNetworkShare(wei(1, 25));

      await builders.connect(BOB).deposit(subnetId, wei(20));
      await rewardPoolMock.setPeriodRewardAnswer(wei(999));
      await setNextTime(1010);
      await expect(builders.claim(subnetId, ZERO_ADDR)).to.be.revertedWith('BT: invalid receiver address');
      await builders.claim(subnetId, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 999));
      expect(await buildersTreasury.distributedRewards()).to.be.equal(wei(999));
    });
    it('should revert if caller is not the builders', async () => {
      await expect(buildersTreasury.sendRewards(BOB, 1)).to.be.revertedWith("BT: the caller isn't the `BuildersV4`");
    });
  });
});

// npx hardhat test "test/builder-protocol/BuildersTreasuryV2.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builder-protocol/BuildersTreasuryV2.test.ts"

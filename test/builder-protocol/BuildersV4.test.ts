import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import { getDefaultBuilderPool, getDefaultSubnetMetadata, getDefaultSubnetV4 } from '../helpers/builders-helper';
import {
  deployBuilders,
  deployBuildersTreasuryV2,
  deployBuildersV4,
  deployFeeConfig,
  deployInterfaceMock,
  deployMOROFT,
  deployRewardPoolMock,
} from '../helpers/deployers';
import { oneDay, oneHour } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { BuildersTreasuryV2, BuildersV4, FeeConfig, MOROFT, RewardPoolMock } from '@/generated-types/ethers';
import { IBuildersV4 } from '@/generated-types/ethers/contracts/builder-protocol/BuildersV4';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('BuildersV4', () => {
  const reverter = new Reverter();

  let builders: BuildersV4;
  let buildersTreasury: BuildersTreasuryV2;
  let rewardPoolMock: RewardPoolMock;
  let feeConfig: FeeConfig;
  let token: MOROFT;

  const minimalWithdrawLockPeriod = oneHour * 0.5;

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let NETWORK_SHARE_OWNER: SignerWithAddress;

  before(async () => {
    [OWNER, BOB, FEE_TREASURY, MINTER, NETWORK_SHARE_OWNER] = await ethers.getSigners();

    token = await deployMOROFT(101, OWNER, OWNER, MINTER);
    feeConfig = await deployFeeConfig(FEE_TREASURY);
    buildersTreasury = await deployBuildersTreasuryV2(token);
    rewardPoolMock = await deployRewardPoolMock();
    builders = await deployBuildersV4(
      token,
      feeConfig,
      buildersTreasury,
      rewardPoolMock,
      NETWORK_SHARE_OWNER,
      minimalWithdrawLockPeriod,
    );

    await buildersTreasury.setBuilders(builders);

    await token.connect(MINTER).mint(OWNER, wei(1000));
    await token.connect(MINTER).mint(BOB, wei(1000));
    await token.connect(MINTER).mint(buildersTreasury, wei(10000));
    await token.connect(OWNER).approve(builders, wei(1000));
    await token.connect(BOB).approve(builders, wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#BuildersV4__init', () => {
      it('should set correct data after creation', async () => {
        const token_ = await builders.depositToken();
        expect(token_).to.eq(await token.getAddress());

        const feeConfig_ = await builders.feeConfig();
        expect(feeConfig_).to.eq(await feeConfig.getAddress());

        const rewardPool_ = await builders.rewardPool();
        expect(rewardPool_).to.eq(await rewardPoolMock.getAddress());

        const buildersTreasury_ = await builders.buildersTreasury();
        expect(buildersTreasury_).to.eq(await buildersTreasury.getAddress());

        const networkShareOwner_ = await builders.networkShareOwner();
        expect(networkShareOwner_).to.eq(NETWORK_SHARE_OWNER);

        const minimalWithdrawLockPeriod_ = await builders.minimalWithdrawLockPeriod();
        expect(minimalWithdrawLockPeriod_).to.eq(minimalWithdrawLockPeriod);
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(
          builders.BuildersV4_init(
            token,
            feeConfig,
            buildersTreasury,
            rewardPoolMock,
            NETWORK_SHARE_OWNER,
            minimalWithdrawLockPeriod,
          ),
        ).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const implFactory = await ethers.getContractFactory('L1SenderMock');
        const impl = await implFactory.deploy();

        expect(await builders.version()).to.eq(4);
        await builders.upgradeTo(impl);
        expect(await builders.version()).to.eq(666);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(builders.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IBuildersV4', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await builders.supportsInterface(await interfaceMock.getIBuildersV4())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await builders.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setFeeConfig', () => {
    it('should set fee config', async () => {
      const feeConfigNew = await deployFeeConfig(FEE_TREASURY);

      await builders.setFeeConfig(feeConfigNew);

      expect(await builders.feeConfig()).to.equal(await feeConfigNew.getAddress());
    });
    it('should revert if provided fee config is not IFeeConfig', async () => {
      await expect(builders.setFeeConfig(builders)).to.be.revertedWith('BU: invalid fee config');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setFeeConfig(feeConfig)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setBuildersTreasury', () => {
    it('should set builders treasury', async () => {
      const buildersTreasuryNew = await deployBuildersTreasuryV2(token);

      await builders.setBuildersTreasury(buildersTreasuryNew);

      expect(await builders.buildersTreasury()).to.equal(await buildersTreasuryNew.getAddress());
    });
    it('should revert if provided builders treasury is not IBuildersTreasuryV2', async () => {
      await expect(builders.setBuildersTreasury(builders)).to.be.revertedWith('BU: invalid builders treasury');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setBuildersTreasury(buildersTreasury)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setRewardPool', () => {
    it('should set builders treasury', async () => {
      const rewardPoolMockNew = await deployRewardPoolMock();

      await builders.setRewardPool(rewardPoolMockNew);

      expect(await builders.rewardPool()).to.equal(await rewardPoolMockNew.getAddress());
    });
    it('should revert if provided reward pool is not `IRewardPool`', async () => {
      await expect(builders.setRewardPool(builders)).to.be.revertedWith('BU: invalid reward pool address');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setRewardPool(rewardPoolMock)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setNetworkShareOwner', () => {
    it('should set network share owner', async () => {
      await builders.setNetworkShareOwner(BOB);

      expect(await builders.networkShareOwner()).to.equal(BOB);
    });
    it('should revert if set zero address as owner', async () => {
      await expect(builders.setNetworkShareOwner(ZERO_ADDR)).to.be.revertedWith('BU: cannot set zero address as owner');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setNetworkShareOwner(BOB)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setNetworkShare', () => {
    it('should set network share owner', async () => {
      await builders.setNetworkShare(wei(0.9, 25));
      expect(await builders.networkShare()).to.equal(wei(0.9, 25));

      await builders.connect(NETWORK_SHARE_OWNER).setNetworkShare(wei(0.8, 25));
      expect(await builders.networkShare()).to.equal(wei(0.8, 25));
    });
    it('should revert if invalid share', async () => {
      await expect(builders.setNetworkShare(wei(1.001, 25))).to.be.revertedWith('BU: invalid share');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setNetworkShare(1)).to.be.revertedWith('BU: invalid caller');
    });
  });

  describe('#setSubnetCreationFeeAmount', () => {
    it('should set network share owner', async () => {
      await builders.setSubnetCreationFeeAmount(wei(0.9, 25));
      expect(await builders.subnetCreationFeeAmount()).to.equal(wei(0.9, 25));
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setSubnetCreationFeeAmount(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setMinimalWithdrawLockPeriod', () => {
    it('should set minimal withdraw lock period', async () => {
      await builders.setMinimalWithdrawLockPeriod(1);

      expect(await builders.minimalWithdrawLockPeriod()).to.equal(1);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setMinimalWithdrawLockPeriod(oneHour)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#createSubnet', () => {
    let subnet: IBuildersV4.SubnetStruct;
    let subnetId: string;
    let metadata: IBuildersV4.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnetV4(OWNER);
      metadata = getDefaultSubnetMetadata();
      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should create the Subnet', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);

      const subnet_ = await builders.subnets(subnetId);
      expect(subnet_.name).to.equal(subnet.name);
      expect(subnet_.admin).to.equal(subnet.admin);
      expect(subnet_.withdrawLockPeriodAfterDeposit).to.equal(subnet.withdrawLockPeriodAfterDeposit);
      expect(subnet_.minimalDeposit).to.equal(subnet.minimalDeposit);
      expect(subnet_.claimAdmin).to.equal(subnet.claimAdmin);

      const metadata_ = await builders.subnetsMetadata(subnetId);
      expect(metadata_.slug).to.equal(metadata.slug);
      expect(metadata_.description).to.equal(metadata.description);
      expect(metadata_.website).to.equal(metadata.website);
      expect(metadata_.image).to.equal(metadata.image);
    });
    it('should create the Subnet with enabled creation fee', async () => {
      await feeConfig.setBaseFeeForOperation(await builders.FEE_SUBNET_CREATE(), wei(1));
      await builders.setSubnetCreationFeeAmount(wei(5));
      await builders.connect(BOB).createSubnet(subnet, metadata);

      expect(await token.balanceOf(FEE_TREASURY)).to.equal(wei(5));
    });
    it('should revert if try to update the Subnet with old ID.', async () => {
      const { builders: buildersV1 } = await deployBuilders(token, feeConfig, 1, 1);
      const oldSubnet = getDefaultBuilderPool(OWNER);
      await buildersV1.createBuilderPool(oldSubnet);

      const implFactory = await ethers.getContractFactory('BuildersV4');
      const impl = await implFactory.deploy();

      await buildersV1.upgradeTo(impl);
      const buildersV4 = impl.attach(buildersV1) as BuildersV4;

      await expect(buildersV4.createSubnet({ ...subnet, name: oldSubnet.name }, metadata)).to.be.revertedWith(
        'BU: the Subnet already exist (2)',
      );
    });
    it('should revert if name is empty', async () => {
      const subnet_ = { ...subnet, name: '' };
      await expect(builders.createSubnet(subnet_, metadata)).to.be.revertedWith('BU: invalid project name');
    });
    it('should revert if admin address is zero', async () => {
      const subnet_ = { ...subnet, admin: ZERO_ADDR };
      await expect(builders.createSubnet(subnet_, metadata)).to.be.revertedWith('BU: invalid admin address');
    });
    it('should revert if claim admin address is zero', async () => {
      const subnet_ = { ...subnet, claimAdmin: ZERO_ADDR };
      await expect(builders.createSubnet(subnet_, metadata)).to.be.revertedWith('BU: invalid claim admin address');
    });
    it('should revert if name is already taken', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      await expect(builders.createSubnet(subnet, metadata)).to.be.revertedWith('BU: the Subnet already exist (1)');
    });
    it('should revert if withdraw lock period is invalid', async () => {
      const subnet_ = { ...subnet, withdrawLockPeriodAfterDeposit: 1 };
      await expect(builders.createSubnet(subnet_, metadata)).to.be.revertedWith('BU: invalid withdraw lock period');
    });
  });

  describe('#editSubnet', () => {
    let subnet: IBuildersV4.SubnetStruct;
    let subnetId: string;

    beforeEach(async () => {
      subnet = getDefaultSubnetV4(BOB);
      subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).createSubnet(subnet, getDefaultSubnetMetadata());
    });

    it('should edit the existed Subnet', async () => {
      subnet.admin = OWNER;
      subnet.claimAdmin = OWNER;
      subnet.minimalDeposit = wei(100);
      subnet.withdrawLockPeriodAfterDeposit = minimalWithdrawLockPeriod;
      await builders.connect(BOB).editSubnet(subnetId, subnet);

      const subnet_ = await builders.subnets(subnetId);
      expect(subnet_.name).to.equal(subnet.name);
      expect(subnet_.admin).to.equal(subnet.admin);
      expect(subnet_.withdrawLockPeriodAfterDeposit).to.equal(subnet.withdrawLockPeriodAfterDeposit);
      expect(subnet_.minimalDeposit).to.equal(subnet.minimalDeposit);
      expect(subnet_.claimAdmin).to.equal(subnet.claimAdmin);
    });
    it('should revert if called by non-admin', async () => {
      await expect(builders.editSubnet(subnetId, subnet)).to.be.revertedWith('BU: not the Subnet owner');
    });
    it('should revert if name is empty', async () => {
      const subnet_ = { ...subnet, name: '123' };
      await expect(builders.connect(BOB).editSubnet(subnetId, subnet_)).to.be.revertedWith(
        `BU: the name can't be changed`,
      );
    });
    it('should revert if admin address is zero', async () => {
      const subnet_ = { ...subnet, admin: ZERO_ADDR };
      await expect(builders.connect(BOB).editSubnet(subnetId, subnet_)).to.be.revertedWith('BU: invalid admin address');
    });
    it('should revert if claim admin address is zero', async () => {
      const subnet_ = { ...subnet, claimAdmin: ZERO_ADDR };
      await expect(builders.connect(BOB).editSubnet(subnetId, subnet_)).to.be.revertedWith(
        'BU: invalid claim admin address',
      );
    });
  });

  describe('#editSubnetMetadata', () => {
    let subnet: IBuildersV4.SubnetStruct;
    let subnetId: string;

    beforeEach(async () => {
      subnet = getDefaultSubnetV4(OWNER);
      subnetId = await builders.getSubnetId(subnet.name);
      await builders.createSubnet(subnet, getDefaultSubnetMetadata());
    });
    it('should edit the existed Subnet metadata', async () => {
      const metadata = {
        slug: 'Slug 2',
        description: 'Description 2',
        website: 'Website 2',
        image: 'Image 2',
      };
      await builders.editSubnetMetadata(subnetId, metadata);

      const metadata_ = await builders.subnetsMetadata(subnetId);
      expect(metadata_.slug).to.equal(metadata.slug);
      expect(metadata_.description).to.equal(metadata.description);
      expect(metadata_.website).to.equal(metadata.website);
      expect(metadata_.image).to.equal(metadata.image);
    });
    it('should revert when not a Subnet owner', async () => {
      await expect(builders.connect(BOB).editSubnetMetadata(subnetId, getDefaultSubnetMetadata())).to.be.revertedWith(
        'BU: not the Subnet owner',
      );
    });
  });

  describe('#getSubnetId and #getSubnetIdOld', () => {
    it('should have different IDs', async () => {
      expect(await builders.getSubnetId('name')).to.not.equal(await builders.getSubnetIdOld('name'));
    });
  });

  describe('#deposit', () => {
    let subnetId1: string;
    let subnetId2: string;

    beforeEach(async () => {
      const subnet1 = { ...getDefaultSubnetV4(OWNER), name: '1' };
      const subnet2 = { ...getDefaultSubnetV4(BOB), name: '2' };

      subnetId1 = await builders.getSubnetId(subnet1.name);
      subnetId2 = await builders.getSubnetId(subnet2.name);

      await builders.createSubnet(subnet1, getDefaultSubnetMetadata());
      await builders.createSubnet(subnet2, getDefaultSubnetMetadata());

      await builders.setNetworkShare(wei(1, 25));
    });

    it('should deposit correctly, 2 Subnets, 2 stakers', async () => {
      await rewardPoolMock.setPeriodRewardAnswer(wei(100));
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));

      let userData = await builders.usersData(BOB, subnetId1);
      expect(userData.deposited).to.eq(wei(20));
      expect(userData.lastDeposit).to.eq(1000);
      let subnetData = await builders.subnetsData(subnetId1);
      expect(subnetData.deposited).to.eq(wei(20));
      expect(subnetData.rate).to.eq(0);
      expect(subnetData.pendingRewards).to.eq(0);
      let allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(0);
      expect(allSubnetData.totalDeposited).to.eq(wei(20));
      let allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(100));
      expect(allSubnetDataV4.lastUpdate).to.eq(1000);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(200));
      await setNextTime(1010);
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      userData = await builders.usersData(BOB, subnetId2);
      expect(userData.deposited).to.eq(wei(80));
      expect(userData.lastDeposit).to.eq(1010);
      subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(80));
      expect(subnetData.rate).to.eq(wei(10, 25)); // 200 / 20
      expect(subnetData.pendingRewards).to.eq(0);
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(10, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(100));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(200));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(100));
      expect(allSubnetDataV4.lastUpdate).to.eq(1010);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1020);
      await builders.connect(OWNER).deposit(subnetId1, wei(60));

      userData = await builders.usersData(OWNER, subnetId1);
      expect(userData.deposited).to.eq(wei(60));
      expect(userData.lastDeposit).to.eq(1020);
      subnetData = await builders.subnetsData(subnetId1);
      expect(subnetData.deposited).to.eq(wei(80));
      expect(subnetData.rate).to.eq(wei(20, 25)); // 10 + 1000 / 100
      expect(subnetData.pendingRewards).to.eq(wei(400)); // (20 - 0) * 20
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(20, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(160));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1200));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(100));
      expect(allSubnetDataV4.lastUpdate).to.eq(1020);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(2000));
      await setNextTime(1030);
      await builders.connect(OWNER).deposit(subnetId2, wei(40));

      userData = await builders.usersData(OWNER, subnetId2);
      expect(userData.deposited).to.eq(wei(40));
      expect(userData.lastDeposit).to.eq(1030);
      subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(120));
      expect(subnetData.rate).to.eq(wei(32.5, 25)); // 20 + 2000 / 160
      expect(subnetData.pendingRewards).to.eq(wei(1800)); // (32,5 - 10) * 80
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(32.5, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(200));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(3200));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(100));
      expect(allSubnetDataV4.lastUpdate).to.eq(1030);

      expect(await token.balanceOf(builders)).to.eq(wei(200));
    });
    it("should revert if the Subnet doesn't exist", async () => {
      await expect(builders.deposit(await builders.getSubnetId('bla'), wei(1))).to.be.revertedWith(
        "BU: the Subnet doesn't exist",
      );
    });
    it('should revert if amount is less than minimal deposit', async () => {
      await expect(builders.deposit(subnetId1, 1)).to.be.revertedWith('BU: amount too low');
    });
  });

  describe('#withdraw', () => {
    let subnetId1: string;
    let subnetId2: string;

    beforeEach(async () => {
      const subnet1 = { ...getDefaultSubnetV4(OWNER), name: '1' };
      const subnet2 = { ...getDefaultSubnetV4(BOB), name: '2' };

      subnetId1 = await builders.getSubnetId(subnet1.name);
      subnetId2 = await builders.getSubnetId(subnet2.name);

      await builders.createSubnet(subnet1, getDefaultSubnetMetadata());
      await builders.createSubnet(subnet2, getDefaultSubnetMetadata());

      await builders.setNetworkShare(wei(1, 25));
    });

    it('should correctly withdraw', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010 + 10 * oneDay);
      await builders.connect(BOB).withdraw(subnetId2, wei(50));

      let userData = await builders.usersData(BOB, subnetId2);
      expect(userData.deposited).to.eq(wei(30));
      expect(userData.lastDeposit).to.eq(1001);
      let subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(30));
      expect(subnetData.rate).to.eq(wei(10, 25)); // 1000 / 100
      expect(subnetData.pendingRewards).to.eq(wei(800)); // (10 - 0) * 80
      let allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(10, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(50));
      let allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1000));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1010 + 10 * oneDay);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(500));
      await setNextTime(1020 + 10 * oneDay);
      await builders.connect(BOB).withdraw(subnetId1, wei(999));

      userData = await builders.usersData(BOB, subnetId1);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.lastDeposit).to.eq(1000);
      subnetData = await builders.subnetsData(subnetId1);
      expect(subnetData.deposited).to.eq(wei(0));
      expect(subnetData.rate).to.eq(wei(20, 25)); // 10 + 500 / 50
      expect(subnetData.pendingRewards).to.eq(wei(400)); // (20 - 0) * 20
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(20, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(30));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1500));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1020 + 10 * oneDay);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(300));
      await setNextTime(1030 + 10 * oneDay);
      await builders.connect(BOB).withdraw(subnetId2, wei(999));

      userData = await builders.usersData(BOB, subnetId2);
      expect(userData.deposited).to.eq(wei(0));
      expect(userData.lastDeposit).to.eq(1001);
      subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(0));
      expect(subnetData.rate).to.eq(wei(30, 25)); // 20 + 300 / 30
      expect(subnetData.pendingRewards).to.eq(wei(1400)); // (30 - 10) * 30
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(30, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(0));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1800));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1030 + 10 * oneDay);

      // *****

      await rewardPoolMock.setPeriodRewardAnswer(wei(100));
      await setNextTime(1040 + 10 * oneDay);
      await builders.connect(BOB).deposit(subnetId2, wei(1));

      userData = await builders.usersData(BOB, subnetId2);
      expect(userData.deposited).to.eq(wei(1));
      expect(userData.lastDeposit).to.eq(1040 + 10 * oneDay);
      subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(1));
      expect(subnetData.rate).to.eq(wei(30, 25));
      expect(subnetData.pendingRewards).to.eq(wei(1400));
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(30, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(1));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1800));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(100));
      expect(allSubnetDataV4.lastUpdate).to.eq(1040 + 10 * oneDay);

      expect(await token.balanceOf(builders)).to.eq(wei(1));
    });
    it('should revert if trying to withdraw zero', async () => {
      await expect(builders.withdraw(subnetId1, 0)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if user didn't deposit", async () => {
      await expect(builders.withdraw(subnetId1, 1)).to.be.revertedWith('BU: nothing to withdraw');
    });
    it("should revert if the Subnet isn't found", async () => {
      await expect(builders.withdraw(await builders.getSubnetId('bla'), 1)).to.be.revertedWith(
        "BU: the Subnet doesn't exist",
      );
    });
    it("should revert if `minimalDeposit` didn't pass", async () => {
      await setNextTime(1000);
      await builders.deposit(subnetId1, wei(1));

      await setNextTime(1010 + 1 + 10 * oneDay);
      await expect(builders.withdraw(subnetId1, wei(0.99))).to.be.revertedWith('BU: invalid withdraw amount');
    });
    it("should revert if `withdrawLockPeriodAfterDeposit` didn't pass", async () => {
      await setNextTime(1000);
      await builders.deposit(subnetId1, wei(1));
      await expect(builders.withdraw(subnetId1, wei(0.1))).to.be.revertedWith('BU: user withdraw is locked');
    });
  });

  describe('#claim', () => {
    let subnetId1: string;
    let subnetId2: string;

    beforeEach(async () => {
      const subnet1 = { ...getDefaultSubnetV4(OWNER), name: '1' };
      const subnet2 = { ...getDefaultSubnetV4(BOB), name: '2' };

      subnetId1 = await builders.getSubnetId(subnet1.name);
      subnetId2 = await builders.getSubnetId(subnet2.name);

      await builders.createSubnet(subnet1, getDefaultSubnetMetadata());
      await builders.createSubnet(subnet2, getDefaultSubnetMetadata());

      await builders.setNetworkShare(wei(1, 25));
    });

    it('should correctly claim', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010);
      await builders.claim(subnetId1, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(200));
      let subnetData = await builders.subnetsData(subnetId1);
      expect(subnetData.deposited).to.eq(wei(20));
      expect(subnetData.rate).to.eq(wei(10, 25)); // 1000 / 100
      expect(subnetData.pendingRewards).to.eq(wei(0));
      let allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(10, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(100));
      let allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(1000));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1010);

      await rewardPoolMock.setPeriodRewardAnswer(wei(2000));
      await setNextTime(1020);
      await builders.connect(BOB).claim(subnetId2, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(200 + 800 + (2000 / 100) * 80));
      subnetData = await builders.subnetsData(subnetId2);
      expect(subnetData.deposited).to.eq(wei(80));
      expect(subnetData.rate).to.eq(wei(30, 25)); // 10 + 2000 / 100
      expect(subnetData.pendingRewards).to.eq(wei(0));
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(30, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(100));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(3000));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1020);

      await rewardPoolMock.setPeriodRewardAnswer(wei(0));
      await setNextTime(1030);
      await builders.claim(subnetId1, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(200 + 800 + (2000 / 100) * 80 + 400));
      subnetData = await builders.subnetsData(subnetId1);
      expect(subnetData.deposited).to.eq(wei(20));
      expect(subnetData.rate).to.eq(wei(30, 25));
      expect(subnetData.pendingRewards).to.eq(wei(0));
      allSubnetData = await builders.allSubnetsData();
      expect(allSubnetData.rate).to.eq(wei(30, 25));
      expect(allSubnetData.totalDeposited).to.eq(wei(100));
      allSubnetDataV4 = await builders.allSubnetsDataV4();
      expect(allSubnetDataV4.distributedRewards).to.eq(wei(3000));
      expect(allSubnetDataV4.undistributedRewards).to.eq(wei(0));
      expect(allSubnetDataV4.lastUpdate).to.eq(1030);

      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 3000));
    });
    it('should correctly claim and pay claim fee', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      await feeConfig.setFeeForOperation(builders, await builders.FEE_CLAIM_OPERATION(), wei(0.2, 25));

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010);
      await builders.claim(subnetId1, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(0.8 * 200));
      expect(await token.balanceOf(FEE_TREASURY)).to.eq(wei(0.2 * 200));
      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 200));
    });
    it('should correctly claim from the claim owner', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      await builders.editSubnet(subnetId1, {
        ...getDefaultSubnetV4(OWNER),
        name: '1',
        claimAdmin: NETWORK_SHARE_OWNER,
      });

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010);
      await builders.connect(NETWORK_SHARE_OWNER).claim(subnetId1, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(200));
      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 200));
    });
    it('should correctly claim with reduced network share', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      await builders.setNetworkShare(wei(0.2, 25));

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010);
      await builders.claim(subnetId1, NETWORK_SHARE_OWNER);

      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(0.2 * 200));
      expect(await token.balanceOf(buildersTreasury)).to.eq(wei(10000 - 0.2 * 200));
    });
    it("should revert if the Subnet doesn't exist", async () => {
      await expect(builders.claim(await builders.getSubnetId('bla'), BOB)).to.be.revertedWith(
        "BU: the Subnet doesn't exist",
      );
    });
    it('should revert if nothing to claim', async () => {
      await expect(builders.claim(subnetId1, BOB)).to.be.revertedWith('BU: nothing to claim');
    });
    it('should revert if caller is not-admin of the pool', async () => {
      await expect(builders.connect(BOB).claim(subnetId1, BOB)).to.be.revertedWith('BU: invalid caller');
    });
  });

  describe('#getCurrentSubnetsRewards and #getCurrentSubnetRewards', () => {
    let subnetId1: string;
    let subnetId2: string;

    beforeEach(async () => {
      const subnet1 = { ...getDefaultSubnetV4(OWNER), name: '1' };
      const subnet2 = { ...getDefaultSubnetV4(BOB), name: '2' };

      subnetId1 = await builders.getSubnetId(subnet1.name);
      subnetId2 = await builders.getSubnetId(subnet2.name);

      await builders.createSubnet(subnet1, getDefaultSubnetMetadata());
      await builders.createSubnet(subnet2, getDefaultSubnetMetadata());

      await builders.setNetworkShare(wei(1, 25));
    });

    it('should correctly calculate potential rewards', async () => {
      await setNextTime(1000);
      await builders.connect(BOB).deposit(subnetId1, wei(20));
      await builders.connect(BOB).deposit(subnetId2, wei(80));

      await rewardPoolMock.setPeriodRewardAnswer(wei(1000));
      await setNextTime(1010);
      await builders.connect(BOB).deposit(subnetId1, wei(60));

      await rewardPoolMock.setPeriodRewardAnswer(wei(2000));

      expect(await builders.getCurrentSubnetRewards(subnetId1)).to.eq(wei(200 + 1000));
      expect(await builders.getCurrentSubnetRewards(subnetId2)).to.eq(wei(800 + 1000));
      expect(await builders.getCurrentSubnetsRewards()).to.eq(wei(3000));

      await builders.connect(BOB).claim(subnetId2, NETWORK_SHARE_OWNER);
      expect(await token.balanceOf(NETWORK_SHARE_OWNER)).to.eq(wei(1800));

      await rewardPoolMock.setPeriodRewardAnswer(wei(0));
      expect(await builders.getCurrentSubnetRewards(subnetId1)).to.eq(wei(1200));
      expect(await builders.getCurrentSubnetRewards(subnetId2)).to.eq(0);
      expect(await builders.getCurrentSubnetsRewards()).to.eq(wei(1200));

      expect(await builders.getCurrentSubnetRewards(await builders.getSubnetId('123'))).to.eq(0);
    });
  });
});

// npx hardhat test "test/builder-protocol/BuildersV4.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builder-protocol/BuildersV4.test.ts"

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { encodeBytes32String } from 'ethers';
import { ethers } from 'hardhat';

import { setNextTime, setTime } from '../helpers/block-helper';
import { getDefaultBuildersPoolData, getDefaultSubnet, getDefaultSubnetMetadata } from '../helpers/builders-helper';
import { deployBuilderSubnets, deployFeeConfig, deployInterfaceMock, deployMOROFT } from '../helpers/deployers';
import { oneDay, oneHour } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { BuilderSubnets, FeeConfig, IBuilderSubnets, MOROFT } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('BuilderSubnets', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let FEE_TREASURY: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let TREASURY: SignerWithAddress;
  let SUBNET_TREASURY: SignerWithAddress;

  let builders: BuilderSubnets;

  let feeConfig: FeeConfig;
  let token: MOROFT;

  before(async () => {
    [OWNER, BOB, FEE_TREASURY, MINTER, TREASURY, SUBNET_TREASURY] = await ethers.getSigners();

    token = await deployMOROFT(101, OWNER, OWNER, MINTER);
    feeConfig = await deployFeeConfig(FEE_TREASURY);
    builders = await deployBuilderSubnets(token, feeConfig, TREASURY, 0);

    await token.connect(MINTER).mint(OWNER, wei(1000));
    await token.connect(MINTER).mint(BOB, wei(1000));
    await token.connect(MINTER).mint(TREASURY, wei(1000));

    await token.connect(OWNER).approve(builders, wei(1000));
    await token.connect(BOB).approve(builders, wei(1000));
    await token.connect(TREASURY).approve(builders, wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#BuilderSubnets_init', () => {
      it('should set correct data after creation', async () => {
        const token_ = await builders.token();
        expect(token_).to.eq(await token.getAddress());

        const feeConfig_ = await builders.feeConfig();
        expect(feeConfig_).to.eq(await feeConfig.getAddress());
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(builders.BuilderSubnets_init(token, feeConfig, TREASURY, 1, ZERO_ADDR)).to.be.rejectedWith(reason);
      });
      it('should revert if try to call init function twice', async () => {
        const [lib1Factory, proxyFactory] = await Promise.all([
          ethers.getContractFactory('LinearDistributionIntervalDecrease'),
          ethers.getContractFactory('ERC1967Proxy'),
        ]);

        const [lib1] = await Promise.all([await lib1Factory.deploy()]);

        const [implFactory] = await Promise.all([
          ethers.getContractFactory('BuilderSubnets', {
            libraries: {
              LinearDistributionIntervalDecrease: await lib1.getAddress(),
            },
          }),
        ]);

        const impl = await implFactory.deploy();
        const proxy = await proxyFactory.deploy(impl, '0x');
        const contract = impl.attach(proxy) as BuilderSubnets;

        const invalidBuilderV3 = await deployFeeConfig(OWNER, 1);

        await expect(contract.BuilderSubnets_init(token, feeConfig, TREASURY, 1, invalidBuilderV3)).to.be.rejectedWith(
          'BS: invalid BuildersV3',
        );
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const implFactory = await ethers.getContractFactory('L1SenderMock');
        const impl = await implFactory.deploy();

        expect(await builders.version()).to.eq(1);
        await builders.upgradeTo(impl);
        expect(await builders.version()).to.eq(666);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(builders.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IBuilderSubnets', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await builders.supportsInterface(await interfaceMock.getIBuilderSubnetsInterfaceId())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await builders.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setFeeConfig', () => {
    it('should set fee config', async () => {
      await builders.setFeeConfig(feeConfig);

      expect(await builders.feeConfig()).to.equal(await feeConfig.getAddress());
    });
    it('should revert if provided fee config is not IFeeConfig', async () => {
      await expect(builders.setFeeConfig(builders)).to.be.revertedWith('BS: invalid fee config');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setFeeConfig(feeConfig)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setTreasury', () => {
    it('should set builders treasury', async () => {
      await builders.setTreasury(TREASURY);

      expect(await builders.treasury()).to.equal(TREASURY);
    });
    it('should revert if', async () => {
      await expect(builders.setTreasury(ZERO_ADDR)).to.be.revertedWith('BS: invalid  treasury');
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setTreasury(TREASURY)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setBuildersRewardPoolData', () => {
    it('should set new value', async () => {
      const poolData = getDefaultBuildersPoolData();
      await builders.setBuildersRewardPoolData(poolData);

      const data = await builders.buildersRewardPoolData();
      expect(data.payoutStart).to.equal(poolData.payoutStart);
      expect(data.initialAmount).to.equal(poolData.initialAmount);
      expect(data.interval).to.equal(poolData.interval);
      expect(data.decreaseAmount).to.equal(poolData.decreaseAmount);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setBuildersRewardPoolData(getDefaultBuildersPoolData())).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setRewardCalculationStartsAt', () => {
    it('should set new value', async () => {
      await builders.setRewardCalculationStartsAt(12345);

      const data = await builders.rewardCalculationStartsAt();
      expect(data).to.equal(12345);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.setRewardCalculationStartsAt(0)).to.be.revertedWith("BS: can't be zero");
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setRewardCalculationStartsAt(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setMinWithdrawLockPeriodAfterStake', () => {
    it('should set new value', async () => {
      await builders.setMinWithdrawLockPeriodAfterStake(12345);

      const data = await builders.minWithdrawLockPeriodAfterStake();
      expect(data).to.equal(12345);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setMinWithdrawLockPeriodAfterStake(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setSubnetCreationFee', () => {
    it('should set new value', async () => {
      await builders.setSubnetCreationFee(wei(10), BOB);
      expect(await builders.subnetCreationFeeAmount()).to.equal(wei(10));
      expect(await builders.subnetCreationFeeTreasury()).to.equal(BOB);

      await builders.setSubnetCreationFee(wei(11), OWNER);
      expect(await builders.subnetCreationFeeAmount()).to.equal(wei(11));
      expect(await builders.subnetCreationFeeTreasury()).to.equal(OWNER);
    });
    it('should revert if treasury is invalid', async () => {
      await expect(builders.setSubnetCreationFee(wei(10), ZERO_ADDR)).to.be.revertedWith(
        'BS: invalid creation fee treasury',
      );
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setSubnetCreationFee(1, BOB)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setIsMigrationOver', () => {
    it('should set new value', async () => {
      await builders.setIsMigrationOver(true);

      const data = await builders.isMigrationOver();
      expect(data).to.equal(true);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setIsMigrationOver(false)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#createSubnet', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
    });
    it('should create one Subnet', async () => {
      await builders.setIsMigrationOver(true);
      await setNextTime(oneDay * 90);
      await builders.connect(BOB).createSubnet({ ...subnet, owner: BOB }, metadata);

      const subnetId = await builders.getSubnetId(subnet.name);
      const subnetData = await builders.subnets(subnetId);
      expect(subnetData.name).to.eq(subnet.name);
      expect(subnetData.owner).to.eq(BOB);
      expect(subnetData.minStake).to.eq(subnet.minStake);
      expect(subnetData.fee).to.eq(subnet.fee);
      expect(subnetData.feeTreasury).to.eq(subnet.feeTreasury);
      expect(subnetData.startsAt).to.eq(subnet.startsAt);
      expect(subnetData.withdrawLockPeriodAfterStake).to.eq(subnet.withdrawLockPeriodAfterStake);

      const subnetMetadata = await builders.subnetsMetadata(subnetId);
      expect(subnetMetadata.slug).to.eq(metadata.slug);
      expect(subnetMetadata.description).to.eq(metadata.description);
      expect(subnetMetadata.image).to.eq(metadata.image);
      expect(subnetMetadata.website).to.eq(metadata.website);
    });
    it('should create Subnet and pay creation fee', async () => {
      await builders.setSubnetCreationFee(wei(10), OWNER);
      await builders.setIsMigrationOver(true);
      await setNextTime(oneDay * 90);
      await builders.connect(BOB).createSubnet({ ...subnet, owner: BOB }, metadata);

      expect(await token.balanceOf(BOB)).to.eq(wei(990));
      expect(await token.balanceOf(OWNER)).to.eq(wei(1010));
    });
    it('should create few Subnets', async () => {
      await builders.createSubnet(subnet, metadata);

      const subnet2 = {
        name: 'Test Pool #2',
        owner: SUBNET_TREASURY,
        minStake: wei(2),
        fee: wei(0.1, 25),
        feeTreasury: OWNER,
        startsAt: 1000 * oneDay,
        withdrawLockPeriodAfterStake: 12 * oneDay,
        maxClaimLockEnd: 2000 * oneDay,
      };
      const metadata2 = {
        slug: 'Slug 2',
        description: 'Description 2',
        website: 'Website 2',
        image: 'Image 2',
      };
      await builders.createSubnet(subnet2, metadata2);

      const subnetId2 = await builders.getSubnetId(subnet2.name);
      const subnetData = await builders.subnets(subnetId2);
      expect(subnetData.name).to.eq(subnet2.name);
      expect(subnetData.owner).to.eq(subnet2.owner);
      expect(subnetData.minStake).to.eq(subnet2.minStake);
      expect(subnetData.fee).to.eq(subnet2.fee);
      expect(subnetData.feeTreasury).to.eq(subnet2.feeTreasury);
      expect(subnetData.startsAt).to.eq(subnet2.startsAt);
      expect(subnetData.withdrawLockPeriodAfterStake).to.eq(subnet2.withdrawLockPeriodAfterStake);

      const subnetMetadata = await builders.subnetsMetadata(subnetId2);
      expect(subnetMetadata.slug).to.eq(metadata2.slug);
      expect(subnetMetadata.description).to.eq(metadata2.description);
      expect(subnetMetadata.image).to.eq(metadata2.image);
      expect(subnetMetadata.website).to.eq(metadata2.website);
    });
    it('should revert when the subnet already exist', async () => {
      await builders.createSubnet(subnet, metadata);
      await expect(builders.createSubnet(subnet, metadata)).to.be.revertedWith('BS: the subnet already exist');
    });
    it('should revert when invalid name', async () => {
      await expect(builders.createSubnet({ ...subnet, name: '' }, metadata)).to.be.revertedWith('BS: invalid name');
    });
    it('should revert when invalid owner address', async () => {
      await expect(builders.createSubnet({ ...subnet, owner: ZERO_ADDR }, metadata)).to.be.revertedWith(
        'BS: invalid owner address',
      );
    });
    it('should revert when invalid withdraw lock period', async () => {
      await builders.setMinWithdrawLockPeriodAfterStake(200);
      await expect(
        builders.createSubnet({ ...subnet, withdrawLockPeriodAfterStake: 100 }, metadata),
      ).to.be.revertedWith('BS: invalid withdraw lock period');
    });
    it('should revert when invalid fee percent', async () => {
      await expect(builders.createSubnet({ ...subnet, fee: wei(1.001, 25) }, metadata)).to.be.revertedWith(
        'BS: invalid fee percent',
      );
    });
    it('should revert when invalid fee percent', async () => {
      await expect(builders.createSubnet({ ...subnet, feeTreasury: ZERO_ADDR }, metadata)).to.be.revertedWith(
        'BS: invalid fee treasury',
      );
    });
    it('should revert when invalid starts at timestamp', async () => {
      await setNextTime(Number(subnet.startsAt) + 1);
      await builders.setIsMigrationOver(true);
      await expect(builders.connect(BOB).createSubnet(subnet, metadata)).to.be.revertedWith(
        'BS: invalid starts at timestamp',
      );
    });
    it('should revert when try to create subnet from not owner before migration end', async () => {
      await expect(builders.connect(BOB).createSubnet(subnet, metadata)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#editSubnetMetadata', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
    });
    it('should edit the existed Subnet', async () => {
      const metadata2 = {
        slug: 'Slug 2',
        description: 'Description 2',
        website: 'Website 2',
        image: 'Image 2',
      };
      await setNextTime(Number(subnet.startsAt) - 1);
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).editSubnetMetadata(subnetId, metadata2);

      const subnetMetadata = await builders.subnetsMetadata(subnetId);
      expect(subnetMetadata.slug).to.eq(metadata2.slug);
      expect(subnetMetadata.description).to.eq(metadata2.description);
      expect(subnetMetadata.image).to.eq(metadata2.image);
      expect(subnetMetadata.website).to.eq(metadata2.website);
    });
    it('should revert when not a SUbnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.editSubnetMetadata(subnetId, metadata)).to.be.revertedWith('BS: not a Subnet owner');
    });
  });

  describe('#setSubnetOwnership', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
    });
    it('should set the new Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetOwnership(subnetId, OWNER);

      const subnetData = await builders.subnets(subnetId);
      expect(subnetData.owner).to.eq(OWNER);
    });
    it('should revert when not a Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.setSubnetOwnership(subnetId, OWNER)).to.be.revertedWith('BS: not a Subnet owner');
    });
    it('should revert when yhe value is invalid', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.connect(BOB).setSubnetOwnership(subnetId, ZERO_ADDR)).to.be.revertedWith(
        'BS: new owner is the zero address',
      );
    });
  });

  describe('#setSubnetMinStake', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
    });
    it('should set the new Subnet min stake', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetMinStake(subnetId, 2);

      const subnetData = await builders.subnets(subnetId);
      expect(subnetData.minStake).to.eq(2);
    });
    it('should revert when not a Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.setSubnetMinStake(subnetId, 2)).to.be.revertedWith('BS: not a Subnet owner');
    });
  });

  describe('#setSubnetFee', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
    });
    it('should set the new Subnet fee', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetFee(subnetId, wei(0.1, 25));

      const subnetData = await builders.subnets(subnetId);
      expect(subnetData.fee).to.eq(wei(0.1, 25));
    });
    it('should revert when not a Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.setSubnetFee(subnetId, 1)).to.be.revertedWith('BS: not a Subnet owner');
    });
    it('should revert when the value is invalid', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.connect(BOB).setSubnetFee(subnetId, wei(0.21, 25))).to.be.revertedWith('BS: invalid fee');
    });
  });

  describe('#setSubnetFeeTreasury', () => {
    let subnet: IBuilderSubnets.SubnetStruct;
    let metadata: IBuilderSubnets.SubnetMetadataStruct;

    beforeEach(async () => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
    });
    it('should set the new Subnet fee treasury', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetFeeTreasury(subnetId, FEE_TREASURY);

      const subnetData = await builders.subnets(subnetId);
      expect(subnetData.feeTreasury).to.eq(FEE_TREASURY);
    });
    it('should revert when not a Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.setSubnetFeeTreasury(subnetId, BOB)).to.be.revertedWith('BS: not a Subnet owner');
    });
    it('should revert when the value is invalid', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.connect(BOB).setSubnetFeeTreasury(subnetId, ZERO_ADDR)).to.be.revertedWith(
        'BS: invalid fee treasury',
      );
    });
  });

  describe('#stake', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(getDefaultBuildersPoolData().payoutStart);
      await builders.setBuildersRewardPoolData(getDefaultBuildersPoolData());

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should stake correctly', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      let subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(10));
      let allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(10));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100);

      expect(await token.balanceOf(BOB)).to.eq(wei(990));
      expect(await token.balanceOf(builders)).to.eq(wei(10));

      // *****

      await builders.connect(OWNER).stake(subnetId, OWNER, wei(20));
      staker = await builders.stakers(subnetId, OWNER);
      expect(staker.lastStake).to.eq(oneDay * 100 + 1);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.pendingRewards).to.eq(wei(0));
      subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(30));
      allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(30));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100 + 1);
      expect(await token.balanceOf(OWNER)).to.eq(wei(980));
      expect(await token.balanceOf(builders)).to.eq(wei(30));
    });
    it('should stake correctly, restake', async () => {
      await builders.setIsMigrationOver(true);

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      // *****

      await builders.connect(BOB).stake(subnetId, BOB, wei(90));

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100 + 1);
      expect(staker.staked).to.eq(wei(100));
      const pendingRewards = staker.pendingRewards;
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      let subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(100));
      let allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(100));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100 + 1);
      expect(allSubnetsData.undistributedRewards).to.greaterThan(0);
      expect(await token.balanceOf(BOB)).to.eq(wei(900));
      expect(await token.balanceOf(builders)).to.eq(wei(100));

      // *****

      await setNextTime(oneDay * 200);
      await builders.connect(BOB).stake(subnetId, BOB, wei(50));
      staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 200);
      expect(staker.staked).to.eq(wei(150));
      expect(staker.pendingRewards).to.greaterThan(pendingRewards);
      subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(150));
      allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(150));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 200);
      expect(await token.balanceOf(BOB)).to.eq(wei(850));
      expect(await token.balanceOf(builders)).to.eq(wei(150));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.stake(encodeBytes32String('1'), BOB, wei(50))).to.be.revertedWith(
        "BS: the Subnet doesn't exist",
      );
    });
    it('should revert when stake amount is zero', async () => {
      await expect(builders.connect(BOB).stake(subnetId, BOB, wei(0))).to.be.revertedWith('BS: nothing to stake');
    });
    it('should revert when sender is incorrect', async () => {
      await builders.setIsMigrationOver(false);
      await expect(builders.connect(BOB).stake(subnetId, BOB, wei(1))).to.be.revertedWith('BS: invalid sender (2)');
    });
    it('should revert stake is not started', async () => {
      await expect(builders.connect(BOB).stake(subnetId, BOB, wei(1))).to.be.revertedWith("BS: stake isn't started");
    });
    it('should revert when staked amount too low', async () => {
      await setNextTime(oneDay * 100);
      await expect(builders.connect(BOB).stake(subnetId, BOB, wei(0.1))).to.be.revertedWith(
        'BS: staked amount too low',
      );
    });
    it('should revert when staked amount too low', async () => {
      await setNextTime(oneDay * 100);
      await expect(builders.connect(BOB).stake(subnetId, OWNER, wei(20))).to.be.revertedWith('BS: invalid sender (1)');
    });
  });

  describe('#withdraw', () => {
    let subnetId: string;
    let withdrawLockPeriodAfterStake: number;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(getDefaultBuildersPoolData().payoutStart);
      await builders.setBuildersRewardPoolData(getDefaultBuildersPoolData());

      subnetId = await builders.getSubnetId(subnet.name);

      withdrawLockPeriodAfterStake = Number(getDefaultSubnet(OWNER, SUBNET_TREASURY).withdrawLockPeriodAfterStake);
    });

    it('should withdraw correctly, partial', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));
      await setNextTime(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      await builders.connect(BOB).withdraw(subnetId, wei(2));

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(8));
      const pendingRewards = staker.pendingRewards;
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      let subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(8));
      let allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(8));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      expect(await token.balanceOf(BOB)).to.eq(wei(992));
      expect(await token.balanceOf(builders)).to.eq(wei(8));

      // *****

      await builders.connect(BOB).withdraw(subnetId, wei(8));
      staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(pendingRewards);
      subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(0));
      allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(0));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 2);
      expect(await token.balanceOf(BOB)).to.eq(wei(1000));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it('should withdraw correctly, full', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));
      await setNextTime(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      await builders.connect(BOB).withdraw(subnetId, wei(200));

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(0));
      const allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(0));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      expect(await token.balanceOf(BOB)).to.eq(wei(1000));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it('should withdraw correctly, with fee', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_WITHDRAW_OPERATION(), wei(0.2, 25));

      await setNextTime(oneDay * 101);
      await builders.connect(BOB).stake(subnetId, BOB, wei(100));

      await setNextTime(oneDay * 110);
      await builders.connect(BOB).withdraw(subnetId, wei(9999));

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 101);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const subnetStaked = await builders.subnetsData(subnetId);
      expect(subnetStaked).to.eq(wei(0));
      const allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(0));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 110);
      expect(await token.balanceOf(BOB)).to.eq(wei(980));
      expect(await token.balanceOf(FEE_TREASURY)).to.eq(wei(20));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.withdraw(encodeBytes32String('1'), wei(50))).to.be.revertedWith(
        "BS: the Subnet doesn't exist",
      );
    });
    it('should revert when nothing to withdraw', async () => {
      await setNextTime(oneDay * 100);
      await expect(builders.withdraw(subnetId, wei(50))).to.be.revertedWith('BS: nothing to withdraw');
    });
    it('should revert when user withdraw is locked', async () => {
      await setNextTime(oneDay * 100);
      await builders.stake(subnetId, OWNER, wei(10));

      await expect(builders.withdraw(subnetId, wei(50))).to.be.revertedWith('BS: user withdraw is locked');
    });
    it('should revert when min stake reached', async () => {
      await setNextTime(oneDay * 100);
      await builders.stake(subnetId, OWNER, wei(10));

      await setNextTime(oneDay * 110);
      await expect(builders.withdraw(subnetId, wei(9.9))).to.be.revertedWith('BS: min stake reached');
    });
  });

  describe('#claim', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.setIsMigrationOver(true);
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(99 * oneDay);
      await builders.setBuildersRewardPoolData({ ...getDefaultBuildersPoolData(), payoutStart: 99 * oneDay });

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should claim correctly and change the desired storage', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));
      await setTime(oneDay * 101);
      expect(await builders.getStakerRewards(subnetId, BOB)).to.closeTo(wei(4.9874), wei(0.001));
      await builders.connect(BOB).claim(subnetId, BOB);

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      const allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.staked).to.eq(wei(10));
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 101 + 1);
    });
    it('should claim correctly, check reward calculation for periods, undistributed rewards', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 101);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 = 399
      // (10 / 399 * 199) * 0.8 = 3.98997493734336
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990 + 3.9899), wei(0.001));
      expect((await builders.allSubnetsData()).undistributedRewards).to.closeTo(wei(200 + 194.0125), wei(0.001));

      await setNextTime(oneDay * 102);
      await builders.connect(BOB).claim(subnetId, BOB);
      // 200 + 199 + 198 = 597
      // (10 / 399 * 199 + 10 / 597 * 198) * 0.8 = 6.64324126900165
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990 + 6.6432), wei(0.001));
      expect((await builders.allSubnetsData()).undistributedRewards).to.closeTo(
        wei(200 + 194.0125 + 194.6834),
        wei(0.001),
      );

      await setNextTime(oneDay * 102 + 1);
      await builders.connect(OWNER).stake(subnetId, OWNER, wei(20));

      await setNextTime(oneDay * 110);
      await builders.connect(BOB).claim(subnetId, BOB);
      await builders.connect(BOB).claim(subnetId, OWNER);
      // 19.9962777584399 * 0.8 = 15.9970222067519
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990 + 15.997), wei(0.001));
      // 23.3844523443756 * 0.8 = 18.7075618755005
      expect(await token.balanceOf(OWNER)).to.closeTo(wei(980 + 18.7075), wei(0.001));
    });
    it('should claim correctly, check reward calculation when without periods, undistributed rewards', async () => {
      await token.connect(MINTER).mint(BOB, wei(9000));
      await token.connect(BOB).approve(builders, wei(10000));

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 101);
      await builders.connect(OWNER).claim(subnetId, BOB);

      await setNextTime(oneDay * 102);
      await builders.connect(BOB).stake(subnetId, BOB, wei(4990));

      await setNextTime(oneDay * 103);
      await builders.connect(OWNER).claim(subnetId, BOB);
      expect(await token.balanceOf(BOB)).to.closeTo(wei(5000 + 6.6432 + 197 * 0.8), wei(0.001));
      expect((await builders.allSubnetsData()).undistributedRewards).to.closeTo(
        wei(200 + 194.0125 + 194.6834),
        wei(0.001),
      );

      await setNextTime(oneDay * 105);
      await builders.connect(OWNER).claim(subnetId, BOB);
      expect(await token.balanceOf(BOB)).to.closeTo(wei(5000 + 6.6432 + (197 + 196 + 195) * 0.8), wei(0.001));
      expect((await builders.allSubnetsData()).undistributedRewards).to.closeTo(
        wei(200 + 194.0125 + 194.6834),
        wei(0.001),
      );

      await builders.connect(BOB).withdraw(subnetId, wei(4000));

      await setNextTime(oneDay * 106);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // (1000 / 1379 * 194) * 0.8 = 112.545322697607
      expect(await token.balanceOf(BOB)).to.closeTo(
        wei(9000 + 6.6432 + (197 + 196 + 195) * 0.8 + 112.5453),
        wei(0.001),
      );
      expect((await builders.allSubnetsData()).undistributedRewards).to.closeTo(
        wei(200 + 194.0125 + 194.6834 + 53.3183),
        wei(0.001),
      );
    });
    it('should claim correctly, with all fees', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_CLAIM_OPERATION(), wei(0.3, 25));

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 * 0.5 = 2.4937343358396
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990) + wei(2.4937), wei(0.001));
      // 10 / 399 * 199 * 0.3 = 1.49624060150376
      expect(await token.balanceOf(FEE_TREASURY)).to.closeTo(wei(1.4962), wei(0.001));
      // 10 / 399 * 199 * 0.2 = 0.99749373433584
      expect(await token.balanceOf(SUBNET_TREASURY)).to.closeTo(wei(0.9974), wei(0.001));
    });
    it('should claim correctly, without fees', async () => {
      const subnet_ = { ...getDefaultSubnet(OWNER, SUBNET_TREASURY), name: 'test_', fee: 0 };
      const metadata_ = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet_, metadata_);
      const subnetId_ = await builders.getSubnetId(subnet_.name);

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId_, BOB, wei(10));

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId_, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 = 4.9874686716792
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990) + wei(4.9874), wei(0.001));
    });
    it('should claim correctly, with fees sum more than 100%', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_CLAIM_OPERATION(), wei(0.3, 25));

      const subnet_ = { ...getDefaultSubnet(OWNER, SUBNET_TREASURY), name: 'test_', fee: wei(0.99, 25) };
      const metadata_ = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet_, metadata_);
      const subnetId_ = await builders.getSubnetId(subnet_.name);

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId_, BOB, wei(10));

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId_, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 * 0.3 = 1.49624060150376
      expect(await token.balanceOf(FEE_TREASURY)).to.closeTo(wei(1.4962), wei(0.001));
      // 10 / 399 * 199 - 10 / 399 * 199 * 0.3 = 3.49122807017544
      expect(await token.balanceOf(SUBNET_TREASURY)).to.closeTo(wei(3.49122), wei(0.001));
      expect(await token.balanceOf(BOB)).to.eq(wei(990));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.claim(encodeBytes32String('1'), OWNER)).to.be.revertedWith("BS: the Subnet doesn't exist");
    });
    it('should revert when nothing to claim', async () => {
      await expect(builders.claim(subnetId, OWNER)).to.be.revertedWith('BS: nothing to claim');
    });
  });

  describe('#collectRewardRate', () => {
    let res = [wei(0), wei(0)];

    beforeEach(async () => {
      await builders.setBuildersRewardPoolData(getDefaultBuildersPoolData());
    });

    it('should correctly calculate rewards, zero before pool starts', async () => {
      await builders.setRewardCalculationStartsAt(oneDay * 10);

      res = await builders.collectRewardRate(wei(1), oneDay * 1, oneDay * 2);
      expect(res[0]).to.eq(wei(0));
    });
    it('should correctly calculate rewards, full periods, from builders reward pool start', async () => {
      // 200 / 200 = 1
      res = await builders.collectRewardRate(wei(1), oneDay * 90, oneDay * 91);
      expect(res[0]).to.eq(wei(1, 25));

      // 200 / 200 + 199 / 399 = 1,49874686716792
      res = await builders.collectRewardRate(wei(1), oneDay * 90, oneDay * 92);
      expect(res[0]).closeTo(wei(1.4987, 25), wei(0.0001, 25));

      // 200 / 200 + 199 / 399 + 198 / 597 + 197 / 794 = 2,07851598985946
      res = await builders.collectRewardRate(wei(1), oneDay * 90, oneDay * 94);
      expect(res[0]).closeTo(wei(2.07851598985946, 25), wei(0.0001, 25));
    });
    it('should correctly calculate rewards, full periods, intermediate periods for builders reward pool', async () => {
      // 200 + 199 + 198 + 197 + 196 + 195 + 194 + 193 + 192 + 191 = 1955

      // 190 / (1955 + 190) = 0,0885780885780886
      res = await builders.collectRewardRate(wei(1), oneDay * 100, oneDay * 101);
      expect(res[0]).closeTo(wei(0.0885, 25), wei(0.0001, 25));

      // 190 / (1955 + 190) + 189 / (1955 + 190 + 189) = 0,169554952331302
      res = await builders.collectRewardRate(wei(10), oneDay * 100, oneDay * 102);
      expect(res[0]).closeTo(wei(0.1695, 25), wei(0.0001, 25));

      // 190 / (1955 + 190) + 189 / (1955 + 190 + 189) + 188 / (1955 + 190 + 189 + 188) + 187 / (1955 + 190 + 189 + 188 + 187) = 0,313128127072062
      res = await builders.collectRewardRate(wei(50), oneDay * 100, oneDay * 104);
      expect(res[0]).closeTo(wei(0.3131, 25), wei(0.0001, 25));
    });
    it('should correctly calculate rewards, less than one period, intermediate periods for builders reward pool', async () => {
      // 200 + 199 + 198 + 197 + 196 + 195 + 194 + 193 = 1572

      // 48 / (1572 + 48) = 0.296296296296296
      res = await builders.collectRewardRate(wei(1), oneDay * 98, oneDay * 98 + oneHour * 6);
      expect(res[0]).closeTo(wei(0.0296, 25), wei(0.0001, 25));

      // 96 / (1572 + 144) = 0,0559440559440559
      res = await builders.collectRewardRate(wei(1), oneDay * 98 + oneHour * 6, oneDay * 98 + oneHour * 18);
      expect(res[0]).closeTo(wei(0.0559, 25), wei(0.0001, 25));

      // 48 / (1572 + 192) = 0,0272108843537415
      res = await builders.collectRewardRate(wei(1), oneDay * 98 + oneHour * 18, oneDay * 98 + oneHour * 24);
      expect(res[0]).closeTo(wei(0.0272, 25), wei(0.0001, 25));
    });
    it('should correctly calculate rewards, more than one period, intermediate periods for builders reward pool', async () => {
      // 200 + 199 + 198 + 197 + 196 + 195 + 194 = 1379

      // 193 / (1379 + 193) + 48 / (1379 + 193 + 48) = 0.152403166525304
      res = await builders.collectRewardRate(wei(1), oneDay * 97, oneDay * 98 + oneHour * 6);
      expect(res[0]).closeTo(wei(0.1524, 25), wei(0.0001, 25));

      // 193 / (1379 + 193) + 96 / (1379 + 193 + 96) = 0.180327493730207
      res = await builders.collectRewardRate(wei(10), oneDay * 97, oneDay * 98 + oneHour * 12);
      expect(res[0]).closeTo(wei(0.1803, 25), wei(0.0001, 25));

      // 193 / (1379 + 193) + 144 / (1379 + 193 + 144) = 0.206689620811758
      res = await builders.collectRewardRate(wei(10), oneDay * 97, oneDay * 98 + oneHour * 18);
      expect(res[0]).closeTo(wei(0.2066, 25), wei(0.0001, 25));
    });
    it('should return 0 when `from` larger or equal then `to`', async () => {
      res = await builders.collectRewardRate(wei(10), oneDay * 2, oneDay * 2);
      expect(res[0]).to.eq(wei(0));

      res = await builders.collectRewardRate(wei(10), oneDay * 2 + 1, oneDay * 2);
      expect(res[0]).to.eq(wei(0));
    });
    it('should return 0 when `virtualStaked` zero', async () => {
      res = await builders.collectRewardRate(wei(0), oneDay * 2, oneDay * 2 + 1);
      expect(res[0]).to.eq(wei(0));
    });
  });

  describe('#collectPendingRewards', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setIsMigrationOver(true);
      await builders.setRewardCalculationStartsAt(99 * oneDay);
      await builders.setBuildersRewardPoolData({ ...getDefaultBuildersPoolData(), payoutStart: 99 * oneDay });

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should collect pending rewards, periods', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 103);
      await builders.connect(OWNER).collectPendingRewards(oneDay * 101);
      await builders.connect(BOB).collectPendingRewards(oneDay * 102);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 + 198 + 197 = 794
      // (10 / 399 * 199 + 10 / 597 * 198 + 10 / 794 * 197) * 0.8 = 8.62812791887571
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990) + wei(8.6281), wei(0.001));
    });
    it('should collect pending rewards, max', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 102);
      await builders.connect(OWNER).collectPendingRewards(oneDay * 999);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 + 198 = 597
      // (10 / 399 * 199 + 10 / 597 * 198) * 0.8 = 6.64324126900165
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990) + wei(6.6432), wei(0.001));
    });
    it('should collect pending rewards', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));
      await setNextTime(oneDay * 102);
      await builders.connect(BOB).claim(subnetId, BOB);
      await builders.connect(BOB).withdraw(subnetId, wei(999));
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(6.6432), wei(0.001));
      let allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 102 + 1);

      await setNextTime(oneDay * 110);
      await builders.connect(OWNER).collectPendingRewards(oneDay * 999);
      allSubnetsData = await builders.allSubnetsData();
      expect(allSubnetsData.lastCalculatedTimestamp).to.eq(oneDay * 110);

      await setNextTime(oneDay * 111);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));
      await setNextTime(oneDay * 112);
      await builders.connect(BOB).claim(subnetId, BOB);
      // 200 + 199 + 198 + 197 + 196 + 195 + 194 + 193 + 192 + 191 + 190 + 189 + 188 = 2522
      // (10 / 2522 * 188) * 0.8 = 8.62812791887571
      expect(await token.balanceOf(BOB)).to.closeTo(wei(990) + wei(6.6432) + wei(0.5962), wei(0.001));
    });
    it('should return 0 when `virtualStaked` zero', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10));

      await setNextTime(oneDay * 102);
      await expect(builders.collectPendingRewards(oneDay * 100 - 1)).to.be.rejectedWith('BS: `to_` is too low');
    });
  });
});

// npx hardhat test "test/builder-subnets/BuilderSubnets.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builder-subnets/BuilderSubnets.test.ts"

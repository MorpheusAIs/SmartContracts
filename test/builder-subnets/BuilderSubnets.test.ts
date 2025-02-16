import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { encodeBytes32String } from 'ethers';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import {
  getDefaultBuildersPoolData,
  getDefaultSubnet,
  getDefaultSubnetMetadata,
  getRealBuildersPoolData,
} from '../helpers/builders-helper';
import { deployBuilderSubnets, deployFeeConfig, deployInterfaceMock, deployMOROFT } from '../helpers/deployers';
import { oneDay, oneHour } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { BuilderSubnets, FeeConfig, IBuilderSubnets, MOROFT } from '@/generated-types/ethers';
import { PRECISION, ZERO_ADDR } from '@/scripts/utils/constants';
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

        await expect(builders.BuilderSubnets_init(token, feeConfig, TREASURY, 1)).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const BuildersV2Mock = await ethers.getContractFactory('BuildersV2Mock');
        const buildersV2Mock = await BuildersV2Mock.deploy();

        expect(await builders.version()).to.eq(1);
        await builders.upgradeTo(buildersV2Mock);
        expect(await builders.version()).to.eq(999);
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

  describe('#setBuildersPoolData', () => {
    it('should set new value', async () => {
      const poolData = getDefaultBuildersPoolData();
      await builders.setBuildersPoolData(poolData);

      const data = await builders.buildersPoolData();
      expect(data.payoutStart).to.equal(poolData.payoutStart);
      expect(data.initialAmount).to.equal(poolData.initialAmount);
      expect(data.interval).to.equal(poolData.interval);
      expect(data.decreaseAmount).to.equal(poolData.decreaseAmount);
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setBuildersPoolData(getDefaultBuildersPoolData())).to.be.revertedWith(
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
      await expect(builders.connect(BOB).setRewardCalculationStartsAt(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setMaxStakedShareForBuildersPool', () => {
    it('should set new value', async () => {
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      const data = await builders.maxStakedShareForBuildersPool();
      expect(data).to.equal(wei(1, 25));
    });
    it('should revert if called by non-owner', async () => {
      await expect(builders.connect(BOB).setMaxStakedShareForBuildersPool(wei(1, 25))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if invalid percent', async () => {
      await expect(builders.setMaxStakedShareForBuildersPool(wei(1.0001, 25))).to.be.revertedWith(
        'BS: invalid percent',
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
    let subnet: IBuilderSubnets.BuildersSubnetStruct;
    let metadata: IBuilderSubnets.BuildersSubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
    });
    it('should create one Subnet', async () => {
      await builders.setIsMigrationOver(true);
      await setNextTime(oneDay * 90);
      await builders.connect(BOB).createSubnet({ ...subnet, owner: BOB }, metadata);

      const subnetId = await builders.getSubnetId(subnet.name);
      const subnetData = await builders.buildersSubnets(subnetId);
      expect(subnetData.name).to.eq(subnet.name);
      expect(subnetData.owner).to.eq(BOB);
      expect(subnetData.minStake).to.eq(subnet.minStake);
      expect(subnetData.fee).to.eq(subnet.fee);
      expect(subnetData.feeTreasury).to.eq(subnet.feeTreasury);
      expect(subnetData.startsAt).to.eq(subnet.startsAt);
      expect(subnetData.withdrawLockPeriodAfterStake).to.eq(subnet.withdrawLockPeriodAfterStake);
      expect(subnetData.maxClaimLockEnd).to.eq(subnet.maxClaimLockEnd);

      const subnetMetadata = await builders.buildersSubnetsMetadata(subnetId);
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
      const subnetData = await builders.buildersSubnets(subnetId2);
      expect(subnetData.name).to.eq(subnet2.name);
      expect(subnetData.owner).to.eq(subnet2.owner);
      expect(subnetData.minStake).to.eq(subnet2.minStake);
      expect(subnetData.fee).to.eq(subnet2.fee);
      expect(subnetData.feeTreasury).to.eq(subnet2.feeTreasury);
      expect(subnetData.startsAt).to.eq(subnet2.startsAt);
      expect(subnetData.withdrawLockPeriodAfterStake).to.eq(subnet2.withdrawLockPeriodAfterStake);
      expect(subnetData.maxClaimLockEnd).to.eq(subnet2.maxClaimLockEnd);

      const subnetMetadata = await builders.buildersSubnetsMetadata(subnetId2);
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
    it('should revert when invalid claim lock timestamp', async () => {
      await expect(
        builders.createSubnet({ ...subnet, maxClaimLockEnd: Number(subnet.startsAt) - 1 }, metadata),
      ).to.be.revertedWith('BS: invalid max claim lock end timestamp');
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
  });

  describe('#editSubnetMetadata', () => {
    let subnet: IBuilderSubnets.BuildersSubnetStruct;
    let metadata: IBuilderSubnets.BuildersSubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
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

      const subnetMetadata = await builders.buildersSubnetsMetadata(subnetId);
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
    let subnet: IBuilderSubnets.BuildersSubnetStruct;
    let metadata: IBuilderSubnets.BuildersSubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
    });
    it('should set the new Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetOwnership(subnetId, OWNER);

      const subnetData = await builders.buildersSubnets(subnetId);
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
    let subnet: IBuilderSubnets.BuildersSubnetStruct;
    let metadata: IBuilderSubnets.BuildersSubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
    });
    it('should set the new Subnet min stake', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetMinStake(subnetId, 2);

      const subnetData = await builders.buildersSubnets(subnetId);
      expect(subnetData.minStake).to.eq(2);
    });
    it('should revert when not a Subnet owner', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);

      await expect(builders.setSubnetMinStake(subnetId, 2)).to.be.revertedWith('BS: not a Subnet owner');
    });
  });

  describe('#setSubnetFeeTreasury', () => {
    let subnet: IBuilderSubnets.BuildersSubnetStruct;
    let metadata: IBuilderSubnets.BuildersSubnetMetadataStruct;

    beforeEach(() => {
      subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      metadata = getDefaultSubnetMetadata();
    });
    it('should set the new Subnet min stake', async () => {
      await builders.connect(BOB).createSubnet(subnet, metadata);
      const subnetId = await builders.getSubnetId(subnet.name);
      await builders.connect(BOB).setSubnetFeeTreasury(subnetId, FEE_TREASURY);

      const subnetData = await builders.buildersSubnets(subnetId);
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

  describe('#setSubnetMaxClaimLockEnd', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(BOB, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();

      await builders.connect(BOB).createSubnet(subnet, metadata);
      subnetId = await builders.getSubnetId(subnet.name);
    });
    it('should set the new Subnet min stake', async () => {
      await setNextTime(300 * oneDay);
      await builders.connect(BOB).setSubnetMaxClaimLockEnd(subnetId, 300 * oneDay);

      const subnetData = await builders.buildersSubnets(subnetId);
      expect(subnetData.maxClaimLockEnd).to.eq(300 * oneDay);
    });
    it('should revert when not a Subnet owner', async () => {
      await setNextTime(300 * oneDay);
      await expect(builders.setSubnetMaxClaimLockEnd(subnetId, 300 * oneDay)).to.be.revertedWith(
        'BS: not a Subnet owner',
      );
    });
    it('should revert when edit max claim lock end before previous end', async () => {
      await expect(builders.connect(BOB).setSubnetMaxClaimLockEnd(subnetId, 300 * oneDay)).to.be.revertedWith(
        'BS: the previous value should expire',
      );
    });
    it('should revert when new max claim lock less then previous', async () => {
      await setNextTime(300 * oneDay);
      await expect(builders.connect(BOB).setSubnetMaxClaimLockEnd(subnetId, oneDay)).to.be.revertedWith(
        'BS: claim lock end too low',
      );
    });
  });

  describe('#stake', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(getDefaultBuildersPoolData().payoutStart);
      await builders.setBuildersPoolData(getDefaultBuildersPoolData());
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should stake correctly, from account A to account B', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), 0);

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.lastInteraction).to.eq(oneDay * 100);
      expect(staker.claimLockEnd).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.virtualStaked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      let buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(10));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(10));
      expect(await builders.totalStaked()).to.eq(wei(10));
      expect(await token.balanceOf(BOB)).to.eq(wei(990));
      expect(await token.balanceOf(builders)).to.eq(wei(10));

      // *****

      await builders.connect(BOB).stake(subnetId, OWNER, wei(20), 0);
      staker = await builders.stakers(subnetId, OWNER);
      expect(staker.lastStake).to.eq(oneDay * 100 + 1);
      expect(staker.lastInteraction).to.eq(oneDay * 100 + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 100 + 1);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.virtualStaked).to.eq(wei(20));
      expect(staker.pendingRewards).to.eq(wei(0));
      buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(30));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(30));
      expect(await builders.totalStaked()).to.eq(wei(30));
      expect(await token.balanceOf(BOB)).to.eq(wei(970));
      expect(await token.balanceOf(builders)).to.eq(wei(30));
    });
    it('should stake correctly, with power factor, apply users claim lock end', async () => {
      const builderPool = getRealBuildersPoolData();
      await builders.setBuildersPoolData(builderPool);

      await setNextTime(builderPool.payoutStart + oneDay - 1);
      await builders.setSubnetMaxClaimLockEnd(subnetId, builderPool.payoutStart + oneDay * 2000);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), builderPool.payoutStart + oneDay * 1000);

      const powerFactor1 = await builders.getPowerFactor(
        builderPool.payoutStart + oneDay,
        builderPool.payoutStart + oneDay * 1000,
      );

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastInteraction).to.eq(builderPool.payoutStart + oneDay);
      expect(staker.claimLockEnd).to.eq(builderPool.payoutStart + oneDay * 1000);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.virtualStaked).to.eq((wei(10) * powerFactor1) / PRECISION);
      expect(staker.virtualStaked).to.greaterThan(staker.staked);
      expect(staker.pendingRewards).to.eq(wei(0));
      let buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(10));
      expect(buildersSubnetData.virtualStaked).to.eq((wei(10) * powerFactor1) / PRECISION);
      expect(await builders.totalStaked()).to.eq(wei(10));
      expect(await token.balanceOf(BOB)).to.eq(wei(990));
      expect(await token.balanceOf(builders)).to.eq(wei(10));

      // *****

      await builders.connect(BOB).stake(subnetId, OWNER, wei(20), builderPool.payoutStart + oneDay * 1000);

      const powerFactor2 = await builders.getPowerFactor(
        builderPool.payoutStart + oneDay + 1,
        builderPool.payoutStart + oneDay * 1000,
      );

      staker = await builders.stakers(subnetId, OWNER);
      expect(staker.lastInteraction).to.eq(builderPool.payoutStart + oneDay + 1);
      expect(staker.claimLockEnd).to.eq(builderPool.payoutStart + oneDay * 1000);
      expect(staker.staked).to.eq(wei(20));
      expect(staker.virtualStaked).to.eq((wei(20) * powerFactor2) / PRECISION);
      expect(staker.virtualStaked).to.greaterThan(staker.staked);
      expect(staker.pendingRewards).to.eq(wei(0));
      buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(30));
      expect(buildersSubnetData.virtualStaked).to.eq(
        (wei(10) * powerFactor1) / PRECISION + (wei(20) * powerFactor2) / PRECISION,
      );
      expect(await builders.totalStaked()).to.eq(wei(30));
      expect(await token.balanceOf(BOB)).to.eq(wei(970));
      expect(await token.balanceOf(builders)).to.eq(wei(30));
    });
    it('should stake correctly, with power factor, apply current timestamp claim lock end', async () => {
      await setNextTime(oneDay * 110);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), 0);
      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.claimLockEnd).to.eq(oneDay * 110);
    });
    it('should stake correctly, with power factor, apply existed claim lock end', async () => {
      await setNextTime(oneDay * 110);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), oneDay * 120);
      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.claimLockEnd).to.eq(oneDay * 120);

      await builders.connect(BOB).stake(subnetId, BOB, wei(20), 0);
      staker = await builders.stakers(subnetId, BOB);
      expect(staker.claimLockEnd).to.eq(oneDay * 120);
    });
    it('should stake correctly, with power factor, apply max claim lock end', async () => {
      await setNextTime(oneDay * 110);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), oneDay * 9999);

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.claimLockEnd).to.eq(getDefaultSubnet(OWNER, SUBNET_TREASURY).maxClaimLockEnd);
    });
    it('should stake correctly, restake', async () => {
      await builders.setIsMigrationOver(true);

      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), 0);

      // *****

      await builders.connect(BOB).stake(subnetId, BOB, wei(90), 0);

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100 + 1);
      expect(staker.lastInteraction).to.eq(oneDay * 100 + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 100 + 1);
      expect(staker.staked).to.eq(wei(100));
      expect(staker.virtualStaked).to.eq(wei(100));
      const pendingRewards = staker.pendingRewards;
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      let buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(100));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(100));
      expect(await builders.totalStaked()).to.eq(wei(100));
      expect(await token.balanceOf(BOB)).to.eq(wei(900));
      expect(await token.balanceOf(builders)).to.eq(wei(100));

      // *****

      await setNextTime(oneDay * 200);
      await builders.connect(BOB).stake(subnetId, BOB, wei(50), 0);
      staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 200);
      expect(staker.lastInteraction).to.eq(oneDay * 200);
      expect(staker.claimLockEnd).to.eq(oneDay * 200);
      expect(staker.staked).to.eq(wei(150));
      expect(staker.virtualStaked).to.eq(wei(150));
      expect(staker.pendingRewards).to.greaterThan(pendingRewards);
      buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(150));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(150));
      expect(await builders.totalStaked()).to.eq(wei(150));
      expect(await token.balanceOf(BOB)).to.eq(wei(850));
      expect(await token.balanceOf(builders)).to.eq(wei(150));
    });
    it('should change the power factor after the restake', async () => {
      const builderPool = getRealBuildersPoolData();
      await builders.setBuildersPoolData(builderPool);

      await setNextTime(builderPool.payoutStart + oneDay - 1);
      await builders.setSubnetMaxClaimLockEnd(subnetId, builderPool.payoutStart + oneDay * 2000);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), builderPool.payoutStart + oneDay * 1000);

      await setNextTime(builderPool.payoutStart + 100 * oneDay);
      await builders.connect(BOB).stake(subnetId, BOB, wei(90), 0);

      const powerFactor2 = await builders.getPowerFactor(
        builderPool.payoutStart + 100 * oneDay,
        builderPool.payoutStart + oneDay * 1000,
      );

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastInteraction).to.eq(builderPool.payoutStart + 100 * oneDay);
      expect(staker.claimLockEnd).to.eq(builderPool.payoutStart + oneDay * 1000);
      expect(staker.staked).to.eq(wei(100));
      expect(staker.virtualStaked).to.eq((wei(100) * powerFactor2) / PRECISION);
      expect(staker.virtualStaked).to.greaterThan(staker.staked);
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(100));
      expect(buildersSubnetData.virtualStaked).to.eq((wei(100) * powerFactor2) / PRECISION);
      expect(await builders.totalStaked()).to.eq(wei(100));
      expect(await token.balanceOf(BOB)).to.eq(wei(900));
      expect(await token.balanceOf(builders)).to.eq(wei(100));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.stake(encodeBytes32String('1'), BOB, wei(50), 0)).to.be.revertedWith(
        "BS: the Subnet doesn't exist",
      );
    });
    it('should revert when stake amount is zero', async () => {
      await expect(builders.stake(subnetId, BOB, wei(0), 0)).to.be.revertedWith('BS: nothing to stake');
    });
    it('should revert when sender is incorrect', async () => {
      await builders.setIsMigrationOver(true);
      await expect(builders.stake(subnetId, BOB, wei(1), 0)).to.be.revertedWith('BS: invalid sender');
    });
    it('should revert stake is not started', async () => {
      await expect(builders.stake(subnetId, BOB, wei(1), 0)).to.be.revertedWith("BS: stake isn't started");
    });
    it('should revert when staked amount too low', async () => {
      await setNextTime(oneDay * 100);
      await expect(builders.stake(subnetId, BOB, wei(0.1), 0)).to.be.revertedWith('BS: staked amount too low');
    });
  });

  describe('#withdraw', () => {
    let subnetId: string;
    let withdrawLockPeriodAfterStake: number;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(getDefaultBuildersPoolData().payoutStart);
      await builders.setBuildersPoolData(getDefaultBuildersPoolData());
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      subnetId = await builders.getSubnetId(subnet.name);

      withdrawLockPeriodAfterStake = Number(getDefaultSubnet(OWNER, SUBNET_TREASURY).withdrawLockPeriodAfterStake);
    });

    it('should withdraw correctly, partial', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), 0);
      await setNextTime(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      await builders.connect(BOB).withdraw(subnetId, wei(2));

      let staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.lastInteraction).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(8));
      expect(staker.virtualStaked).to.eq(wei(8));
      const pendingRewards = staker.pendingRewards;
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      let buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(8));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(8));
      expect(await builders.totalStaked()).to.eq(wei(8));
      expect(await token.balanceOf(BOB)).to.eq(wei(992));
      expect(await token.balanceOf(builders)).to.eq(wei(8));

      // *****

      await builders.connect(BOB).withdraw(subnetId, wei(8));
      staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.lastInteraction).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 2);
      expect(staker.claimLockEnd).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.virtualStaked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(pendingRewards);
      buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(0));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(0));
      expect(await builders.totalStaked()).to.eq(wei(0));
      expect(await token.balanceOf(BOB)).to.eq(wei(1000));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it('should withdraw correctly, full', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), 0);
      await setNextTime(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      await builders.connect(BOB).withdraw(subnetId, wei(200));

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.lastInteraction).to.eq(oneDay * 100 + withdrawLockPeriodAfterStake + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.virtualStaked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(0));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(0));
      expect(await builders.totalStaked()).to.eq(wei(0));
      expect(await token.balanceOf(BOB)).to.eq(wei(1000));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it('should withdraw correctly and not change the power factor', async () => {
      const builderPool = getRealBuildersPoolData();
      await builders.setBuildersPoolData(builderPool);

      await setNextTime(builderPool.payoutStart + oneDay - 1);
      await builders.setSubnetMaxClaimLockEnd(subnetId, builderPool.payoutStart + oneDay * 2000);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), builderPool.payoutStart + oneDay * 1000);

      const powerFactor = await builders.getPowerFactor(
        builderPool.payoutStart + oneDay,
        builderPool.payoutStart + oneDay * 1000,
      );

      await setNextTime(builderPool.payoutStart + 10 * oneDay);
      await builders.connect(BOB).withdraw(subnetId, wei(6));

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(builderPool.payoutStart + oneDay);
      expect(staker.lastInteraction).to.eq(builderPool.payoutStart + 10 * oneDay);
      expect(staker.claimLockEnd).to.eq(builderPool.payoutStart + oneDay * 1000);
      expect(staker.staked).to.eq(wei(4));
      expect(staker.virtualStaked).to.eq((wei(4) * powerFactor) / PRECISION);
      expect(staker.virtualStaked).to.greaterThan(staker.staked);
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(4));
      expect(buildersSubnetData.virtualStaked).to.eq((wei(4) * powerFactor) / PRECISION);
      expect(await builders.totalStaked()).to.eq(wei(4));
      expect(await token.balanceOf(BOB)).to.eq(wei(1006));
      expect(await token.balanceOf(builders)).to.eq(wei(4));
    });
    it('should withdraw correctly with fee', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_WITHDRAW_OPERATION(), wei(0.2, 25));

      await setNextTime(oneDay * 101);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(100), 0);

      await setNextTime(oneDay * 110);
      await builders.connect(BOB).withdraw(subnetId, wei(9999));

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 101);
      expect(staker.lastInteraction).to.eq(oneDay * 110);
      expect(staker.claimLockEnd).to.eq(oneDay * 101);
      expect(staker.staked).to.eq(wei(0));
      expect(staker.virtualStaked).to.eq(wei(0));
      expect(staker.pendingRewards).to.greaterThan(wei(0));
      const buildersSubnetData = await builders.buildersSubnetsData(subnetId);
      expect(buildersSubnetData.staked).to.eq(wei(0));
      expect(buildersSubnetData.virtualStaked).to.eq(wei(0));
      expect(await builders.totalStaked()).to.eq(wei(0));
      expect(await token.balanceOf(BOB)).to.eq(wei(1080));
      expect(await token.balanceOf(FEE_TREASURY)).to.eq(wei(20));
      expect(await token.balanceOf(builders)).to.eq(wei(0));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.withdraw(encodeBytes32String('1'), wei(50))).to.be.revertedWith(
        "BS: the Subnet doesn't exist",
      );
    });
    it('should revert when nothing to withdraw', async () => {
      await expect(builders.withdraw(subnetId, wei(50))).to.be.revertedWith('BS: nothing to withdraw');
    });
    it('should revert when user withdraw is locked', async () => {
      await setNextTime(oneDay * 100);
      await builders.stake(subnetId, OWNER, wei(10), 0);

      await expect(builders.withdraw(subnetId, wei(50))).to.be.revertedWith('BS: user withdraw is locked');
    });
    it('should revert when min stake reached', async () => {
      await setNextTime(oneDay * 100);
      await builders.stake(subnetId, OWNER, wei(10), 0);

      await setNextTime(oneDay * 110);
      await expect(builders.withdraw(subnetId, wei(9.9))).to.be.revertedWith('BS: min stake reached');
    });
  });

  describe('#claim', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(99 * oneDay);
      await builders.setBuildersPoolData({ ...getDefaultBuildersPoolData(), payoutStart: 99 * oneDay });
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should claim correctly and change the desired storage', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), 0);
      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId, BOB);

      const staker = await builders.stakers(subnetId, BOB);
      expect(staker.lastStake).to.eq(oneDay * 100);
      expect(staker.lastInteraction).to.eq(oneDay * 101 + 1);
      expect(staker.claimLockEnd).to.eq(oneDay * 100);
      expect(staker.staked).to.eq(wei(10));
      expect(staker.virtualStaked).to.eq(wei(10));
      expect(staker.pendingRewards).to.eq(wei(0));
      expect(await builders.totalStaked()).to.eq(wei(10));
    });
    it('should claim correctly, check reward calculation', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), 0);

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 * 0.8 = 3.98997493734336
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(3.9899), wei(0.001));

      await setNextTime(oneDay * 102);
      await builders.connect(BOB).claim(subnetId, BOB);
      // 200 + 199 + 198 = 597
      // (10 / 399 * 199 + 10 / 597 * 198) * 0.8 = 6.64324126900165
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(6.6432), wei(0.001));

      await setNextTime(oneDay * 102 + 1);
      await builders.connect(OWNER).stake(subnetId, OWNER, wei(20), 0);

      await setNextTime(oneDay * 103);
      await builders.connect(BOB).claim(subnetId, BOB);
      await builders.connect(BOB).claim(subnetId, OWNER);
      // 200 + 199 + 198 + 197 = 794
      // (10 / 399 * 199 + 10 / 597 * 198 + 10 / 794 * 197) * 0.8 = 8.62812791887571
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(8.6281), wei(0.001));
      // (20 / 794 * 197) * 0.8 = 3.96977329974811
      expect(await token.balanceOf(OWNER)).to.closeTo(wei(970) + wei(3.9697), wei(0.001));
    });
    it('should claim correctly, with all fees', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_CLAIM_OPERATION(), wei(0.3, 25));

      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), 0);

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 * 0.5 = 2.4937343358396
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(2.4937), wei(0.001));
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
      await builders.connect(OWNER).stake(subnetId_, BOB, wei(10), 0);

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId_, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 = 4.9874686716792
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(4.9874), wei(0.001));
    });
    it('should claim correctly, with fees sum more than 100%', async () => {
      await feeConfig.setFeeForOperation(builders, await builders.FEE_CLAIM_OPERATION(), wei(0.3, 25));

      const subnet_ = { ...getDefaultSubnet(OWNER, SUBNET_TREASURY), name: 'test_', fee: wei(0.99, 25) };
      const metadata_ = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet_, metadata_);
      const subnetId_ = await builders.getSubnetId(subnet_.name);

      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId_, BOB, wei(10), 0);

      await setNextTime(oneDay * 101 + 1);
      await builders.connect(BOB).claim(subnetId_, BOB);
      // 200 + 199 = 399
      // 10 / 399 * 199 * 0.3 = 1.49624060150376
      expect(await token.balanceOf(FEE_TREASURY)).to.closeTo(wei(1.4962), wei(0.001));
      // 10 / 399 * 199 - 10 / 399 * 199 * 0.3 = 3.49122807017544
      expect(await token.balanceOf(SUBNET_TREASURY)).to.closeTo(wei(3.49122), wei(0.001));
      expect(await token.balanceOf(BOB)).to.eq(wei(1000));
    });
    it('should correctly calculate contract share limits', async () => {
      await token.connect(MINTER).mint(BOB, wei(10000));
      await token.connect(BOB).approve(builders, wei(10000));

      await builders.setMaxStakedShareForBuildersPool(wei(0.6, 25));

      const builderPool = getRealBuildersPoolData();
      await builders.setBuildersPoolData(builderPool);
      const poolStart = builderPool.payoutStart;

      // 34533.3348
      // const emission = await builders.getPeriodRewardForBuildersPool(0, poolStart + oneDay * 10);
      // 10.7
      // const powerFactor = await builders.getPowerFactor(poolStart + oneDay * 10, poolStart + oneDay * 345 * 10);

      // Limit: 34533.3348 * 0.6 = 20720
      await setNextTime(poolStart + oneDay * 10);
      await builders.setSubnetMaxClaimLockEnd(subnetId, builderPool.payoutStart + oneDay * 345 * 10);
      // 20720 / 10.7 = 1936.4485
      await builders.connect(BOB).stake(subnetId, BOB, wei(1936.44), poolStart + oneDay * 345 * 10);
      await expect(builders.stake(subnetId, BOB, wei(0.1), 0)).to.be.revertedWith(
        'BS: the amount of stakes exceeded the amount of rewards',
      );
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.claim(encodeBytes32String('1'), OWNER)).to.be.revertedWith("BS: the Subnet doesn't exist");
    });
    it('should revert when claim is locked', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(BOB).stake(subnetId, BOB, wei(10), oneDay * 101);

      await expect(builders.claim(subnetId, BOB)).to.be.revertedWith('BS: claim is locked');
    });
    it('should revert when nothing to claim', async () => {
      await expect(builders.claim(subnetId, OWNER)).to.be.revertedWith('BS: nothing to claim');
    });
  });

  describe('#collectPendingRewards', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(99 * oneDay);
      await builders.setBuildersPoolData({ ...getDefaultBuildersPoolData(), payoutStart: 99 * oneDay });
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should collect pending rewards, periods', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), 0);

      await setNextTime(oneDay * 103);
      await builders.connect(OWNER).collectPendingRewards(subnetId, BOB, oneDay * 101);
      await builders.connect(OWNER).collectPendingRewards(subnetId, BOB, oneDay * 102);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 + 198 + 197 = 794
      // (10 / 399 * 199 + 10 / 597 * 198 + 10 / 794 * 197) * 0.8 = 8.62812791887571
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(8.6281), wei(0.001));
    });

    it('should collect pending rewards, max', async () => {
      await setNextTime(oneDay * 100);
      await builders.connect(OWNER).stake(subnetId, BOB, wei(10), 0);

      await setNextTime(oneDay * 102);
      await builders.connect(OWNER).collectPendingRewards(subnetId, BOB, oneDay * 999);
      await builders.connect(OWNER).claim(subnetId, BOB);
      // 200 + 199 + 198 = 597
      // (10 / 399 * 199 + 10 / 597 * 198) * 0.8 = 6.64324126900165
      expect(await token.balanceOf(BOB)).to.closeTo(wei(1000) + wei(6.6432), wei(0.001));
    });
    it("should revert when the Subnet doesn't exist", async () => {
      await expect(builders.collectPendingRewards(encodeBytes32String('1'), OWNER, 1)).to.be.revertedWith(
        "BS: the Subnet doesn't exist",
      );
    });
  });

  describe('#getStakerPowerFactor', () => {
    let subnetId: string;

    beforeEach(async () => {
      const subnet = getDefaultSubnet(OWNER, SUBNET_TREASURY);
      const metadata = getDefaultSubnetMetadata();
      await builders.createSubnet(subnet, metadata);
      await builders.setRewardCalculationStartsAt(99 * oneDay);
      await builders.setBuildersPoolData({ ...getDefaultBuildersPoolData(), payoutStart: 99 * oneDay });
      await builders.setMaxStakedShareForBuildersPool(wei(1, 25));

      subnetId = await builders.getSubnetId(subnet.name);
    });

    it('should correctly calculate the power factor', async () => {
      await token.connect(MINTER).mint(BOB, wei(10000));
      await token.connect(BOB).approve(builders, wei(10000));

      await builders.setMaxStakedShareForBuildersPool(wei(0.6, 25));

      const builderPool = getRealBuildersPoolData();
      await builders.setBuildersPoolData(builderPool);
      const poolStart = builderPool.payoutStart;

      await setNextTime(poolStart + oneDay * 10);
      await builders.setSubnetMaxClaimLockEnd(subnetId, builderPool.payoutStart + oneDay * 345 * 10);
      await builders.connect(BOB).stake(subnetId, BOB, wei(1936.44), poolStart + oneDay * 345 * 10);
      expect(await builders.getStakerPowerFactor(subnetId, BOB)).to.be.closeTo(wei(10.7, 25), wei(0.001));
    });
    it('should return 1 when the Subnet not exists', async () => {
      expect(await builders.getStakerPowerFactor(encodeBytes32String('1'), BOB)).to.be.eq(wei(1, 25));
    });
  });

  describe('#getPeriodRewardForStake', () => {
    beforeEach(async () => {
      await builders.setBuildersPoolData(getDefaultBuildersPoolData());
    });

    it('should correctly calculate rewards, zero before pool starts', async () => {
      let res = wei(0);

      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 1, oneDay * 2);
      expect(res).to.eq(wei(0));
    });
    it('should correctly calculate rewards, full periods, from builders reward pool start', async () => {
      let res = wei(0);

      // 10 / 200 * 200 = 10
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 90, oneDay * 91);
      expect(res).to.eq(wei(10));

      // (10 / 200 * 200) + (10 / (200 + 199) * 199) = 14,9874686716792
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 90, oneDay * 92);
      expect(res).closeTo(wei(14.9874), wei(0.0001));

      // (50 / 200 * 200) + (50 / (200 + 199) * 199) + (50 / (200 + 199 + 198) * 198) + (50 / (200 + 199 + 198 + 197) * 197) = 103,925799492973
      res = await builders.getPeriodRewardForStake(wei(50), oneDay * 90, oneDay * 94);
      expect(res).closeTo(wei(103.9257), wei(0.0001));
    });
    it('should correctly calculate rewards, full periods, intermediate periods for builders reward pool', async () => {
      let res = wei(0);

      // 200 + 199 + 198 + 197 + 196 + 195 + 194 + 193 + 192 + 191 = 1955

      // 10 / (1955 + 190) * 190 = 0.885780885780886
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 100, oneDay * 101);
      expect(res).closeTo(wei(0.8857), wei(0.0001));

      // 10 / (1955 + 190) * 190 + 10 / (1955 + 190 + 189) * 189 = 1.69554952331302
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 100, oneDay * 102);
      expect(res).closeTo(wei(1.6955), wei(0.0001));

      // 50 / (1955 + 190) * 190 + 50 / (1955 + 190 + 189) * 189 + + 50 / (1955 + 190 + 189 + 188) * 188 + 50 / (1955 + 190 + 189 + 188 + 187) * 187 = 15.6564063536031
      res = await builders.getPeriodRewardForStake(wei(50), oneDay * 100, oneDay * 104);
      expect(res).closeTo(wei(15.6564), wei(0.0001));
    });
    it('should correctly calculate rewards, less than one period, intermediate periods for builders reward pool', async () => {
      let res = wei(0);

      // 200 + 199 + 198 + 197 + 196 + 195 + 194 + 193 = 1572

      // 10 / (1572 + 192 / 24 * 6) * (192 / 24 * 6) = 0.296296296296296
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 98, oneDay * 98 + oneHour * 6);
      expect(res).closeTo(wei(0.2962), wei(0.0001));

      // 10 / (1572 + 192 / 24 * 18) * (192 / 24 * 12) = 0.559440559440559
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 98 + oneHour * 6, oneDay * 98 + oneHour * 18);
      expect(res).closeTo(wei(0.5594), wei(0.0001));

      // 10 / (1572 + 192 / 24 * 24) * (192 / 24 * 6) = 0.272108843537415
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 98 + oneHour * 18, oneDay * 98 + oneHour * 24);
      expect(res).closeTo(wei(0.2721), wei(0.0001));
    });
    it('should correctly calculate rewards, more than one period, intermediate periods for builders reward pool', async () => {
      let res = wei(0);

      // 200 + 199 + 198 + 197 + 196 + 195 + 194 = 1379

      // 10 / (1379 + 193) * 193 + 10 / (1379 + 193 + 192 / 24 * 6) * (192 / 24 * 6) = 1.52403166525304
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 97, oneDay * 98 + oneHour * 6);
      expect(res).closeTo(wei(1.524), wei(0.0001));

      // 10 / (1379 + 193) * 193 + 10 / (1379 + 193 + 192 / 24 * 12) * (192 / 24 * 12) = 1.80327493730207
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 97, oneDay * 98 + oneHour * 12);
      expect(res).closeTo(wei(1.8032), wei(0.0001));

      // 10 / (1379 + 193) * 193 + 10 / (1379 + 193 + 192 / 24 * 18) * (192 / 24 * 18) = 2.06689620811758
      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 97, oneDay * 98 + oneHour * 18);
      expect(res).closeTo(wei(2.0668), wei(0.0001));
    });
    it('should return 0 when `from` larger or equal then `to`', async () => {
      let res = wei(0);

      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 2, oneDay * 2);
      expect(res).to.eq(wei(0));

      res = await builders.getPeriodRewardForStake(wei(10), oneDay * 2 + 1, oneDay * 2);
      expect(res).to.eq(wei(0));
    });
  });
});

// npx hardhat test "test/builder-subnets/BuilderSubnets.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builder-subnets/BuilderSubnets.test.ts"

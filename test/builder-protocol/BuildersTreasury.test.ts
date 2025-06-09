import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import { getDefaultBuilderPool } from '../helpers/builders-helper';
import { oneDay } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import { Builders, BuildersTreasury, FeeConfig, IBuilders, MOROFT } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('BuildersTreasury', () => {
  const reverter = new Reverter();

  const chainId = 101;

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let DELEGATE: SignerWithAddress;
  let LZ_ENDPOINT_OWNER: SignerWithAddress;

  let builders: Builders;
  let buildersTreasury: BuildersTreasury;

  let rewardToken: MOROFT;

  before(async () => {
    [OWNER, SECOND, MINTER, DELEGATE, LZ_ENDPOINT_OWNER] = await ethers.getSigners();

    const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
    const [lib2] = await Promise.all([await lib2Factory.deploy()]);

    const [
      buildersFactory,
      buildersTreasuryFactory,
      MOROFTFactory,
      LayerZeroEndpointV2Mock,
      ERC1967ProxyFactory,
      feeConfigFactory,
    ] = await Promise.all([
      ethers.getContractFactory('Builders', {
        libraries: {
          LockMultiplierMath: await lib2.getAddress(),
        },
      }),
      ethers.getContractFactory('BuildersTreasury'),
      ethers.getContractFactory('MOROFT'),
      ethers.getContractFactory('LayerZeroEndpointV2Mock'),
      ethers.getContractFactory('ERC1967Proxy'),
      ethers.getContractFactory('FeeConfig'),
    ]);

    const [buildersImpl, buildersTreasuryImpl, feeConfigImpl, lZEndpointMock] = await Promise.all([
      buildersFactory.deploy(),
      buildersTreasuryFactory.deploy(),
      feeConfigFactory.deploy(),
      LayerZeroEndpointV2Mock.deploy(chainId, LZ_ENDPOINT_OWNER),
    ]);
    let buildersProxy, buildersTreasuryProxy, feeConfigProxy;
    [buildersProxy, buildersTreasuryProxy, feeConfigProxy, rewardToken] = await Promise.all([
      ERC1967ProxyFactory.deploy(buildersImpl, '0x'),
      ERC1967ProxyFactory.deploy(buildersTreasuryImpl, '0x'),
      ERC1967ProxyFactory.deploy(feeConfigImpl, '0x'),
      MOROFTFactory.deploy(lZEndpointMock, DELEGATE, MINTER),
    ]);

    const feeConfig = feeConfigFactory.attach(feeConfigProxy) as FeeConfig;
    builders = buildersFactory.attach(buildersProxy) as Builders;
    buildersTreasury = buildersTreasuryFactory.attach(buildersTreasuryProxy) as BuildersTreasury;

    await builders.Builders_init(rewardToken, feeConfig, buildersTreasury, 0, 0);
    await buildersTreasury.BuildersTreasury_init(rewardToken, builders);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        const buildersTreasuryFactory = await ethers.getContractFactory('BuildersTreasury');
        const buildersTreasury = await buildersTreasuryFactory.deploy();

        await expect(buildersTreasury.BuildersTreasury_init(rewardToken, builders)).to.be.revertedWith(reason);
      });
    });

    describe('#BuildersTreasury_init', () => {
      it('should set correct data after creation', async () => {
        const rewardToken_ = await buildersTreasury.rewardToken();
        expect(rewardToken_).to.eq(await rewardToken.getAddress());

        const builders_ = await buildersTreasury.builders();
        expect(builders_).to.eq(await builders.getAddress());
      });
      it('should revert if `builders` is not IBuilders', async () => {
        const reason = 'BT: invalid builders';

        const [buildersTreasuryFactory, ERC1967ProxyFactory] = await Promise.all([
          ethers.getContractFactory('BuildersTreasury'),
          ethers.getContractFactory('ERC1967Proxy'),
        ]);

        const buildersTreasuryImpl = await buildersTreasuryFactory.deploy();
        const buildersTreasuryProxy = await ERC1967ProxyFactory.deploy(buildersTreasuryImpl, '0x');
        const buildersTreasury = buildersTreasuryFactory.attach(buildersTreasuryProxy) as BuildersTreasury;

        await expect(buildersTreasury.BuildersTreasury_init(rewardToken, buildersTreasury)).to.be.revertedWith(reason);
      });
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(buildersTreasury.BuildersTreasury_init(rewardToken, builders)).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const BuildersV2Mock = await ethers.getContractFactory('L1SenderMock');
        const buildersV2Mock = await BuildersV2Mock.deploy();

        await buildersTreasury.upgradeTo(buildersV2Mock);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(buildersTreasury.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IBuildersTreasury', async () => {
      expect(await buildersTreasury.supportsInterface('0xcf68b86c')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await buildersTreasury.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('#setBuilders', () => {
    it('should set the builders', async () => {
      expect(await buildersTreasury.builders()).to.be.equal(await builders.getAddress());

      const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
      const [lib2] = await Promise.all([await lib2Factory.deploy()]);

      const buildersFactory = await ethers.getContractFactory('Builders', {
        libraries: {
          LockMultiplierMath: await lib2.getAddress(),
        },
      });
      const buildersImpl = await buildersFactory.deploy();

      await buildersTreasury.setBuilders(buildersImpl);

      expect(await buildersTreasury.builders()).to.be.equal(await buildersImpl.getAddress());
    });
    it('should revert if caller is not the owner', async () => {
      await expect(buildersTreasury.connect(SECOND).setBuilders(builders)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#getAllRewards', () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;
    const amount = wei(100);

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      poolId = await builders.getPoolId(builderPool.name);

      await rewardToken.connect(MINTER).mint(OWNER, amount);

      await rewardToken.connect(OWNER).approve(builders, amount);
      await builders.createBuilderPool(builderPool);

      await setNextTime(oneDay * 20);
      await builders.deposit(poolId, amount);
    });
    it('should return all rewards, including distributed', async () => {
      expect(await buildersTreasury.getAllRewards()).to.be.equal(0);

      await rewardToken.connect(MINTER).mint(buildersTreasury, amount);

      expect(await buildersTreasury.getAllRewards()).to.be.equal(amount);

      await builders.claim(poolId, OWNER);

      expect(await buildersTreasury.getAllRewards()).to.be.equal(amount);

      await rewardToken.connect(MINTER).mint(buildersTreasury, amount);

      expect(await buildersTreasury.getAllRewards()).to.be.equal(2n * amount);

      await builders.claim(poolId, OWNER);

      expect(await buildersTreasury.getAllRewards()).to.be.equal(2n * amount);
    });
  });

  describe('#sendRewards', async () => {
    let builderPool: IBuilders.BuilderPoolStruct;
    let poolId: string;
    const amount = wei(100);

    beforeEach(async () => {
      builderPool = getDefaultBuilderPool(OWNER);
      poolId = await builders.getPoolId(builderPool.name);

      await rewardToken.connect(MINTER).mint(buildersTreasury, amount);
      await rewardToken.connect(MINTER).mint(OWNER, amount);

      await rewardToken.connect(OWNER).approve(builders, amount);
      await builders.createBuilderPool(builderPool);

      await setNextTime(oneDay * 20);
      await builders.deposit(poolId, amount);
    });

    it('should send rewards', async () => {
      const tx = await builders.claim(poolId, OWNER);

      await expect(tx).to.changeTokenBalances(rewardToken, [buildersTreasury, OWNER], [-amount, amount]);
    });
    it('should update distributedRewards', async () => {
      expect(await buildersTreasury.distributedRewards()).to.be.equal(0);

      await builders.claim(poolId, OWNER);

      expect(await buildersTreasury.distributedRewards()).to.be.equal(amount);

      await rewardToken.connect(MINTER).mint(buildersTreasury, amount);
      await builders.claim(poolId, OWNER);

      expect(await buildersTreasury.distributedRewards()).to.be.equal(2n * amount);
    });
    it('should revert if caller is not the builders', async () => {
      await expect(buildersTreasury.sendRewards(SECOND, amount)).to.be.revertedWith('BT: caller is not the builders');
    });
  });
});

// npx hardhat test "test/builders/BuildersTreasury.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/builders/BuildersTreasury.test.ts"

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from './helpers/reverter';

import { FeeConfig, FeeConfigV2 } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('FeeConfig', () => {
  const baseFee = wei(0.01, 25); // 1%
  const baseFeeForOperation = wei(0.02, 25); // 2%

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let feeConfig: FeeConfig;

  const reverter = new Reverter();

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const [feeConfigFactory, ERC1967ProxyFactory] = await Promise.all([
      ethers.getContractFactory('FeeConfig'),
      ethers.getContractFactory('ERC1967Proxy'),
    ]);

    const feeConfigImpl = await feeConfigFactory.deploy();
    const feeConfigProxy = await ERC1967ProxyFactory.deploy(feeConfigImpl, '0x');
    feeConfig = feeConfigFactory.attach(feeConfigProxy) as FeeConfig;

    await feeConfig.FeeConfig_init(OWNER, baseFee, baseFeeForOperation);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const feeConfigV2Factory = await ethers.getContractFactory('FeeConfigV2');
        const feeConfigV2Implementation = await feeConfigV2Factory.deploy();

        await feeConfig.upgradeTo(feeConfigV2Implementation);

        const factoryV2 = feeConfigV2Factory.attach(await feeConfig.getAddress()) as FeeConfigV2;

        expect(await factoryV2.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(feeConfig.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('initialization', () => {
    describe('#FeeConfig_init', () => {
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(feeConfig.FeeConfig_init(SECOND, baseFee, baseFeeForOperation)).to.be.rejectedWith(reason);
      });
      it('should revert if `baseFee` or `baseFeeForOperation` is > 1', async () => {
        const [feeConfigFactory, ERC1967ProxyFactory] = await Promise.all([
          ethers.getContractFactory('FeeConfig'),
          ethers.getContractFactory('ERC1967Proxy'),
        ]);

        const feeConfigImpl = await feeConfigFactory.deploy();
        const feeConfigProxy = await ERC1967ProxyFactory.deploy(feeConfigImpl, '0x');
        const feeConfig = feeConfigFactory.attach(feeConfigProxy) as FeeConfig;

        await expect(feeConfig.FeeConfig_init(SECOND, wei(1.1, 25), baseFeeForOperation)).to.be.revertedWith(
          'FC: invalid base fee',
        );
        await expect(feeConfig.FeeConfig_init(SECOND, baseFee, wei(1.1, 25))).to.be.revertedWith(
          'FC: invalid base fee for op',
        );
      });
    });
  });

  describe('#setFee', () => {
    it('should set the fee', async () => {
      expect(await feeConfig.fees(SECOND)).to.be.equal(0);

      await feeConfig.setFee(SECOND, wei(0.2, 25));

      expect(await feeConfig.fees(SECOND)).to.be.equal(wei(0.2, 25));

      await feeConfig.setFee(SECOND, wei(0.1, 25));

      expect(await feeConfig.fees(SECOND)).to.be.equal(wei(0.1, 25));
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setFee(SECOND, wei(0.1, 25))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is greater than 1', async () => {
      await expect(feeConfig.setFee(SECOND, wei(1.1, 25))).to.be.revertedWith('FC: invalid fee');
    });
  });

  describe('#setFeeForOperation', () => {
    it('should set the fee', async () => {
      expect(await feeConfig.feeForOperations(SECOND, 'bla')).to.be.equal(0);

      await feeConfig.setFeeForOperation(SECOND, 'bla', wei(0.2, 25));

      expect(await feeConfig.feeForOperations(SECOND, 'bla')).to.be.equal(wei(0.2, 25));

      await feeConfig.setFeeForOperation(SECOND, 'bla', wei(0.1, 25));

      expect(await feeConfig.feeForOperations(SECOND, 'bla')).to.be.equal(wei(0.1, 25));
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setFeeForOperation(SECOND, 'bla', wei(0.1, 25))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is greater than 1', async () => {
      await expect(feeConfig.setFeeForOperation(SECOND, 'bla', wei(1.1, 25))).to.be.revertedWith('FC: invalid fee');
    });
  });

  describe('#setTreasury', () => {
    it('should set the treasury', async () => {
      await feeConfig.setTreasury(SECOND);

      expect(await feeConfig.treasury()).to.be.equal(SECOND);
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setTreasury(SECOND.address)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if treasury is zero address', async () => {
      await expect(feeConfig.setTreasury(ZERO_ADDR)).to.be.revertedWith('FC: invalid treasury');
    });
  });

  describe('#setBaseFee', () => {
    it('should set the base fee', async () => {
      await feeConfig.setBaseFee(1, 2);

      expect(await feeConfig.baseFee()).to.be.equal(1);
      expect(await feeConfig.baseFeeForOperation()).to.be.equal(2);

      await feeConfig.setBaseFee(3, 4);

      expect(await feeConfig.baseFee()).to.be.equal(3);
      expect(await feeConfig.baseFeeForOperation()).to.be.equal(4);
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setBaseFee(baseFee, baseFeeForOperation)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is > 1', async () => {
      await expect(feeConfig.setBaseFee(wei(1.1, 25), baseFeeForOperation)).to.be.revertedWith('FC: invalid base fee');
      await expect(feeConfig.setBaseFee(baseFee, wei(1.1, 25))).to.be.revertedWith('FC: invalid base fee for op');
    });
  });

  describe('#getFeeAndTreasury', () => {
    it('should return the base fee and treasury', async () => {
      const [fee, treasury] = await feeConfig.getFeeAndTreasury(SECOND);

      expect(fee).to.be.equal(baseFee);
      expect(treasury).to.be.equal(OWNER);
    });
    it('should return the specific fee and treasury', async () => {
      await feeConfig.setFee(SECOND, wei(0.2, 25));
      await feeConfig.setTreasury(SECOND);

      const [fee, treasury] = await feeConfig.getFeeAndTreasury(SECOND);

      expect(fee).to.be.equal(wei(0.2, 25));
      expect(treasury).to.be.equal(SECOND);
    });
  });

  describe('#getFeeAndTreasuryForOperation', () => {
    it('should return the base fee for operation and treasury', async () => {
      const [fee, treasury] = await feeConfig.getFeeAndTreasuryForOperation(SECOND, 'bla');

      expect(fee).to.be.equal(baseFeeForOperation);
      expect(treasury).to.be.equal(OWNER);
    });
    it('should return the specific fee and treasury', async () => {
      await feeConfig.setFeeForOperation(SECOND, 'bla', wei(0.5, 25));
      await feeConfig.setTreasury(SECOND);

      const [fee, treasury] = await feeConfig.getFeeAndTreasuryForOperation(SECOND, 'bla');

      expect(fee).to.be.equal(wei(0.5, 25));
      expect(treasury).to.be.equal(SECOND);
    });
  });
});

// npx hardhat test "test/FeeConfig.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/FeeConfig.test.ts"

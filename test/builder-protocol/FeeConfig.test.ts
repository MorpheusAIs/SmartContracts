import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { encodeBytes32String } from 'ethers';
import { ethers } from 'hardhat';

import { Reverter } from '../helpers/reverter';

import { FeeConfig, FeeConfigV2 } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('FeeConfig', () => {
  const baseFee = wei(0.01, 25); // 1%
  const op1 = encodeBytes32String('op1');

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

    await feeConfig.FeeConfig_init(OWNER, baseFee);

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

        await expect(feeConfig.FeeConfig_init(SECOND, baseFee)).to.be.rejectedWith(reason);
      });
      it('should revert if `baseFee` is >= 1', async () => {
        const [feeConfigFactory, ERC1967ProxyFactory] = await Promise.all([
          ethers.getContractFactory('FeeConfig'),
          ethers.getContractFactory('ERC1967Proxy'),
        ]);

        const feeConfigImpl = await feeConfigFactory.deploy();
        const feeConfigProxy = await ERC1967ProxyFactory.deploy(feeConfigImpl, '0x');
        const feeConfig = feeConfigFactory.attach(feeConfigProxy) as FeeConfig;

        await expect(feeConfig.FeeConfig_init(SECOND, wei(1, 25))).to.be.revertedWith('FC: invalid base fee');
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IFeeConfig', async () => {
      expect(await feeConfig.supportsInterface('0x50aacff8')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await feeConfig.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('#setFee', () => {
    it('should set the fee', async () => {
      expect((await feeConfig.getFeeAndTreasury(SECOND))[0]).to.be.equal(baseFee);

      await feeConfig.setFee(SECOND, wei(0.2, 25));

      expect((await feeConfig.getFeeAndTreasury(SECOND))[0]).to.be.equal(wei(0.2, 25));

      await feeConfig.setFee(SECOND, wei(0.1, 25));

      expect((await feeConfig.getFeeAndTreasury(SECOND))[0]).to.be.equal(wei(0.1, 25));
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setFee(SECOND, wei(0.1, 25))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is >= 1', async () => {
      await expect(feeConfig.setFee(SECOND, wei(1, 25))).to.be.revertedWith('FC: invalid fee');
    });
  });

  describe('#setFeeForOperation', () => {
    it('should set the fee', async () => {
      expect((await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1))[0]).to.be.equal(0);

      await feeConfig.setFeeForOperation(SECOND, op1, wei(0.2, 25));

      expect((await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1))[0]).to.be.equal(wei(0.2, 25));

      await feeConfig.setFeeForOperation(SECOND, op1, wei(0.1, 25));

      expect((await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1))[0]).to.be.equal(wei(0.1, 25));
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setFeeForOperation(SECOND, op1, wei(0.1, 25))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is >= 1', async () => {
      await expect(feeConfig.setFeeForOperation(SECOND, op1, wei(1, 25))).to.be.revertedWith('FC: invalid fee');
    });
  });

  describe('#discardCustomFee', () => {
    it('should discard the custom fee', async () => {
      await feeConfig.setFeeForOperation(SECOND, op1, wei(0.1, 25));

      expect((await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1))[0]).to.be.equal(wei(0.1, 25));

      await feeConfig.discardCustomFee(SECOND, op1);

      expect((await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1))[0]).to.be.equal(0);
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).discardCustomFee(SECOND, op1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setTreasury', () => {
    it('should set the treasury', async () => {
      await feeConfig.setTreasury(SECOND);

      expect((await feeConfig.getFeeAndTreasury(ZERO_ADDR))[1]).to.be.equal(SECOND);
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
      await feeConfig.setBaseFee(1);

      expect((await feeConfig.getFeeAndTreasury(ZERO_ADDR))[0]).to.be.equal(1);

      await feeConfig.setBaseFee(3);

      expect((await feeConfig.getFeeAndTreasury(ZERO_ADDR))[0]).to.be.equal(3);
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setBaseFee(baseFee)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is >= 1', async () => {
      await expect(feeConfig.setBaseFee(wei(1, 25))).to.be.revertedWith('FC: invalid base fee');
    });
  });

  describe('#setBaseFeeForOperation', () => {
    it('should set the base fee for operation', async () => {
      await feeConfig.setBaseFeeForOperation(op1, 1);

      expect((await feeConfig.getFeeAndTreasuryForOperation(ZERO_ADDR, op1))[0]).to.be.equal(1);

      await feeConfig.setBaseFeeForOperation(op1, 3);

      expect((await feeConfig.getFeeAndTreasuryForOperation(ZERO_ADDR, op1))[0]).to.be.equal(3);
    });
    it('should revert if not called by the owner', async () => {
      await expect(feeConfig.connect(SECOND).setBaseFeeForOperation(op1, baseFee)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
    it('should revert if fee is >= 1', async () => {
      await expect(feeConfig.setBaseFeeForOperation(op1, wei(1, 25))).to.be.revertedWith('FC: invalid base fee for op');
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
      await feeConfig.setBaseFeeForOperation(op1, wei(0.2, 25));

      const [fee, treasury] = await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1);

      expect(fee).to.be.equal(wei(0.2, 25));
      expect(treasury).to.be.equal(OWNER);
    });
    it('should return zero if base operation has not set', async () => {
      const [fee, treasury] = await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1);

      expect(fee).to.be.equal(0);
      expect(treasury).to.be.equal(OWNER);
    });
    it('should return the specific fee and treasury', async () => {
      await feeConfig.setFeeForOperation(SECOND, op1, wei(0.5, 25));
      await feeConfig.setTreasury(SECOND);

      const [fee, treasury] = await feeConfig.getFeeAndTreasuryForOperation(SECOND, op1);

      expect(fee).to.be.equal(wei(0.5, 25));
      expect(treasury).to.be.equal(SECOND);
    });
  });
});

// npx hardhat test "test/FeeConfig.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/FeeConfig.test.ts"

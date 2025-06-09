import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { MOR } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('MOR', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let mor: MOR;

  const cap = wei('100');

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const MORFactory = await ethers.getContractFactory('MOR');
    mor = await MORFactory.deploy(cap);

    await reverter.snapshot();
  });

  afterEach(async () => {
    await reverter.revert();
  });

  describe('constructor', () => {
    it('should set the cap', async () => {
      expect(await mor.cap()).to.equal(cap);
    });
    it('should set the name and symbol', async () => {
      expect(await mor.name()).to.equal('MOR');
      expect(await mor.symbol()).to.equal('MOR');
    });
  });

  describe('supportsInterface', () => {
    it('should support IMOR', async () => {
      expect(await mor.supportsInterface('0x75937bf3')).to.be.true;
    });
    it('should support IERC20', async () => {
      expect(await mor.supportsInterface('0x36372b07')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await mor.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('mint', () => {
    it('should mint tokens', async () => {
      const amount = wei('10');

      const tx = await mor.mint(SECOND.address, amount);
      await expect(tx).to.changeTokenBalance(mor, SECOND, amount);
    });
    it('should not mint more than the cap', async () => {
      await expect(mor.mint(SECOND.address, cap + 1n)).to.be.revertedWith('ERC20Capped: cap exceeded');
    });
    it('should revert if not called by the owner', async () => {
      await expect(mor.connect(SECOND).mint(SECOND.address, wei('10'))).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('burn', () => {
    it('should burn tokens', async () => {
      const amount = wei('10');

      await mor.mint(OWNER.address, amount);

      const tx = await mor.burn(amount);

      await expect(tx).to.changeTokenBalance(mor, OWNER, -amount);
    });
  });

  describe('burnFrom', () => {
    it('should burn tokens from another account', async () => {
      const amount = wei('10');

      await mor.mint(OWNER.address, amount);

      await mor.approve(SECOND.address, amount);

      const tx = await mor.connect(SECOND).burnFrom(OWNER.address, amount);

      await expect(tx).to.changeTokenBalance(mor, OWNER, -amount);

      expect(await mor.allowance(OWNER.address, SECOND.address)).to.equal(0);
    });
  });
});

// npx hardhat test "test/MOR.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/MOR.test.ts"

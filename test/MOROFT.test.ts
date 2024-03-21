import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';

import { LayerZeroEndpointV2Mock, MOROFT, MOROFT__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('MOROFT', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let DELEGATE: SignerWithAddress;
  let LZ_ENDPOINT_OWNER: SignerWithAddress;

  let mor: MOROFT;
  let lZEndpointMock: LayerZeroEndpointV2Mock;

  const chainId = 101;
  const cap = wei('100');

  before(async () => {
    [OWNER, SECOND, MINTER, DELEGATE, LZ_ENDPOINT_OWNER] = await ethers.getSigners();

    const [LZEndpointMock, MOR] = await Promise.all([
      ethers.getContractFactory('LayerZeroEndpointV2Mock'),
      ethers.getContractFactory('MOROFT'),
    ]);

    lZEndpointMock = await LZEndpointMock.deploy(chainId, LZ_ENDPOINT_OWNER.address);
    mor = await MOR.deploy(cap, lZEndpointMock, DELEGATE.address, MINTER.address);

    await reverter.snapshot();
  });

  afterEach(async () => {
    await reverter.revert();
  });

  describe('constructor', () => {
    let MOR: MOROFT__factory;

    before(async () => {
      MOR = await ethers.getContractFactory('MOROFT');
    });

    it('should set the cap', async () => {
      expect(await mor.cap()).to.equal(cap);
    });

    it('should set the name and symbol', async () => {
      expect(await mor.name()).to.equal('MOR');
      expect(await mor.symbol()).to.equal('MOR');
      expect(await mor.minter()).to.equal(MINTER.address);
    });

    it("should revert if cap isn't set", async () => {
      await expect(MOR.deploy(0, lZEndpointMock, DELEGATE.address, MINTER.address)).to.be.revertedWith(
        'ERC20Capped: cap is 0',
      );
    });
  });

  describe('supportsInterface', () => {
    it('should support IMOROFT', async () => {
      expect(await mor.supportsInterface('0x499d1179')).to.be.true;
    });
    it('should support IERC20', async () => {
      expect(await mor.supportsInterface('0x36372b07')).to.be.true;
    });
    it('should support IOAppCore', async () => {
      expect(await mor.supportsInterface('0x0c39d358')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await mor.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('mint', () => {
    it('should mint tokens', async () => {
      const amount = wei('10');

      const tx = await mor.connect(MINTER).mint(SECOND.address, amount);
      await expect(tx).to.changeTokenBalance(mor, SECOND, amount);
    });

    it('should not mint more than the cap', async () => {
      await expect(mor.connect(MINTER).mint(SECOND.address, cap + 1n)).to.be.revertedWith('ERC20Capped: cap exceeded');
    });

    it('should revert if not called by the owner', async () => {
      await expect(mor.connect(SECOND).mint(SECOND.address, wei('10'))).to.be.revertedWith('MOROFT: invalid caller');
    });
  });

  describe('burn', () => {
    it('should burn tokens', async () => {
      const amount = wei('10');

      await mor.connect(MINTER).mint(OWNER.address, amount);

      const tx = await mor.burn(amount);

      await expect(tx).to.changeTokenBalance(mor, OWNER, -amount);
    });
  });

  describe('burnFrom', () => {
    it('should burn tokens from another account', async () => {
      const amount = wei('10');

      await mor.connect(MINTER).mint(OWNER.address, amount);

      await mor.approve(SECOND.address, amount);

      const tx = await mor.connect(SECOND).burnFrom(OWNER.address, amount);

      await expect(tx).to.changeTokenBalance(mor, OWNER, -amount);

      expect(await mor.allowance(OWNER.address, SECOND.address)).to.equal(0);
    });
  });
});

// npx hardhat test "test/MOROFT.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/MOROFT.test.ts"

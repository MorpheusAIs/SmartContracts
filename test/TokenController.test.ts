import { MOR, StETHMock, TokenController } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Reverter } from './helpers/reverter';

describe('TokenController', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let THIRD: SignerWithAddress;

  let tokenController: TokenController;
  let steth: StETHMock;
  let mor: MOR;
  before(async () => {
    [OWNER, SECOND, THIRD] = await ethers.getSigners();

    const [TokenController, StETHMock, Mor] = await Promise.all([
      ethers.getContractFactory('TokenController'),
      ethers.getContractFactory('StETHMock'),
      ethers.getContractFactory('MOR'),
    ]);

    steth = await StETHMock.deploy();

    tokenController = await TokenController.deploy(steth, ZERO_ADDR, THIRD, {
      lzEndpoint: THIRD,
      communicator: OWNER,
      communicatorChainId: 2,
    });

    mor = await Mor.deploy(wei(100));
    await mor.transferOwnership(tokenController);

    await tokenController.setParams(steth, mor, { lzEndpoint: THIRD, communicator: OWNER, communicatorChainId: 2 });

    reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('constructor', () => {
    it('should set params', async () => {
      expect(await tokenController.investToken()).to.be.equal(await steth.getAddress());
      expect(await tokenController.rewardToken()).to.be.equal(await mor.getAddress());
      expect(await tokenController.swap()).to.be.equal(await THIRD.getAddress());

      expect(await tokenController.nonce()).to.be.equal(0);

      expect(await tokenController.config()).to.be.deep.equal([await THIRD.getAddress(), await OWNER.getAddress(), 2n]);
    });

    it('should set approve to swap', async () => {
      expect(await steth.allowance(tokenController, THIRD)).to.be.equal(ethers.MaxUint256);
    });
  });

  describe('setParams', () => {
    it('should set params', async () => {
      await tokenController.setParams(mor, steth, {
        lzEndpoint: ZERO_ADDR,
        communicator: SECOND,
        communicatorChainId: 1,
      });

      expect(await tokenController.investToken()).to.be.equal(await mor.getAddress());
      expect(await tokenController.rewardToken()).to.be.equal(await steth.getAddress());

      expect(await tokenController.config()).to.be.deep.equal([ZERO_ADDR, await SECOND.getAddress(), 1n]);
    });

    it('should revert if not owner', async () => {
      await expect(
        tokenController.connect(SECOND).setParams(ZERO_ADDR, ZERO_ADDR, {
          lzEndpoint: ZERO_ADDR,
          communicator: ZERO_ADDR,
          communicatorChainId: 0,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('lzReceive', () => {
    it('should update nonce and mint tokens', async () => {
      const address = ethers.solidityPacked(
        ['address', 'address'],
        [await OWNER.getAddress(), await tokenController.getAddress()],
      );
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [await SECOND.getAddress(), wei(1)],
      );

      const tx = await tokenController.connect(THIRD).lzReceive(2, address, 5, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(1));
      expect(await tokenController.nonce()).to.be.equal(5);
    });
    it('should revert if provided wrong nonce', async () => {
      await expect(tokenController.lzReceive(1, '0x', 0, '0x')).to.be.revertedWith('TC: invalid nonce');
    });
    it('should revert if provided wrong lzEndpoint', async () => {
      await expect(tokenController.lzReceive(0, '0x', 1, '0x')).to.be.revertedWith('TC: invalid lz endpoint');
    });
    it('should revert if provided wrong chainId', async () => {
      await expect(tokenController.connect(THIRD).lzReceive(0, '0x', 1, '0x')).to.be.revertedWith(
        'TC: invalid sender chain ID',
      );
    });
    it('should revert if provided wrong sender', async () => {
      await expect(tokenController.connect(THIRD).lzReceive(2, '0x', 1, '0x')).to.be.revertedWith(
        'TC: invalid sender address',
      );
    });
  });
});

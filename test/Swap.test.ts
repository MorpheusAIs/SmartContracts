import { MOR, StETHMock, Swap, UniswapV2RouterMock } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';
import { Reverter } from './helpers/reverter';

describe('Swap', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let swap: Swap;

  let uniswapV2Router: UniswapV2RouterMock;
  let stETH: StETHMock;
  let mor: MOR;

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const UniswapV2RouterMockFactory = await ethers.getContractFactory('UniswapV2RouterMock');
    uniswapV2Router = await UniswapV2RouterMockFactory.deploy();

    const StETHMockFactory = await ethers.getContractFactory('StETHMock');
    stETH = await StETHMockFactory.deploy();

    const MORFactory = await ethers.getContractFactory('MOR');
    mor = await MORFactory.deploy(OWNER, wei(1000000000));

    const Swap = await ethers.getContractFactory('Swap');
    swap = await Swap.deploy(uniswapV2Router, stETH, mor);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('constructor', () => {
    it('should set uniswapRouter', async () => {
      expect(await swap.uniswapRouter()).to.equal(await uniswapV2Router.getAddress());
    });

    it('should set stETH', async () => {
      expect(await swap.stEth()).to.equal(await stETH.getAddress());
    });

    it('should set correct path', async () => {
      expect(await swap.path(0)).to.equal(await stETH.getAddress());
      expect(await swap.path(1)).to.equal(await mor.getAddress());

      await expect(swap.path(2)).to.be.reverted;
    });

    it('should give allowance to uniswapRouter', async () => {
      expect(await stETH.allowance(swap.getAddress(), uniswapV2Router)).to.equal(ethers.MaxUint256);
    });
  });

  describe('#getAmountsOut', () => {
    beforeEach('setup', async () => {
      await stETH.mint(OWNER, wei(100));
      await mor.mint(OWNER, wei(100));

      await stETH.approve(await uniswapV2Router.getAddress(), wei(5));
      await uniswapV2Router.setReserve(await stETH.getAddress(), wei(5));

      await mor.approve(await uniswapV2Router.getAddress(), wei(10));
      await uniswapV2Router.setReserve(await mor.getAddress(), wei(10));
    });

    it('should return correct amount', async () => {
      await uniswapV2Router.enablePair(await stETH.getAddress(), await mor.getAddress());

      expect(await swap.getAmountsOut(wei(1))).to.equal(wei(2));
    });
  });

  describe('#swapTokensForExactTokens', () => {
    beforeEach('setup', async () => {
      await stETH.mint(OWNER, wei(100));
      await mor.mint(OWNER, wei(100));

      await stETH.approve(await uniswapV2Router.getAddress(), wei(5));
      await uniswapV2Router.setReserve(await stETH.getAddress(), wei(5));

      await mor.approve(await uniswapV2Router.getAddress(), wei(10));
      await uniswapV2Router.setReserve(await mor.getAddress(), wei(10));

      await stETH.approve(swap.getAddress(), wei(10));
      await uniswapV2Router.enablePair(await stETH.getAddress(), await mor.getAddress());
    });

    it('should swap tokens', async () => {
      const tx = await swap.swapStETHToMor(wei(1), wei(1));

      expect(tx).to.changeTokenBalance(mor, OWNER, wei(2));
      expect(tx).to.changeTokenBalance(stETH, OWNER, wei(-1));
    });
  });
});

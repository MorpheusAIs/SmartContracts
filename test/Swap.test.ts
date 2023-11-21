import { MOR, QuoterMock, StETHMock, Swap, UniswapV2RouterMock } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';
import { _getDefaultPool } from './Distribution.test';
import { getCurrentBlockTime } from './helpers/block-helper';
import { Reverter } from './helpers/reverter';

describe('Swap', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let swap: Swap;

  let uniswapV2Router: UniswapV2RouterMock;
  let quoter: QuoterMock;
  let stETH: StETHMock;
  let mor: MOR;

  let fee = 0;
  let sqrtPriceLimitX96ts = 0;

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const UniswapV2RouterMockFactory = await ethers.getContractFactory('UniswapV2RouterMock');
    uniswapV2Router = await UniswapV2RouterMockFactory.deploy();

    const QuoterMockFactory = await ethers.getContractFactory('QuoterMock');
    quoter = await QuoterMockFactory.deploy();

    const StETHMockFactory = await ethers.getContractFactory('StETHMock');
    stETH = await StETHMockFactory.deploy();

    const MORFactory = await ethers.getContractFactory('MOR');
    mor = await MORFactory.deploy(OWNER, wei(1000000000));

    const Swap = await ethers.getContractFactory('Swap');
    swap = await Swap.deploy(
      uniswapV2Router,
      quoter,
      _getDefaultSwapParams(await stETH.getAddress(), await mor.getAddress())
    );

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('constructor', () => {
    it('should set swapRouter', async () => {
      expect(await swap.swapRouter()).to.equal(await uniswapV2Router.getAddress());
    });

    it('should set quoter', async () => {
      expect(await swap.quoter()).to.equal(await quoter.getAddress());
    });

    it('should set params', async () => {
      const defaultParams = _getDefaultSwapParams(await stETH.getAddress(), await mor.getAddress());
      const params = await swap.params();

      expect(params.tokenIn).to.equal(defaultParams.tokenIn);
      expect(params.tokenOut).to.equal(defaultParams.tokenOut);
      expect(params.fee).to.equal(defaultParams.fee);
      expect(params.sqrtPriceLimitX96).to.equal(defaultParams.sqrtPriceLimitX96);
    });

    it('should give allowance to uniswapRouter', async () => {
      expect(await stETH.allowance(swap, uniswapV2Router)).to.equal(ethers.MaxUint256);
    });
  });

  describe('#getEstimatedMorForStETH', () => {
    beforeEach('setup', async () => {
      await stETH.mint(OWNER, wei(100));
      await mor.mint(OWNER, wei(100));

      await stETH.approve(await uniswapV2Router.getAddress(), wei(5));
      await mor.approve(await uniswapV2Router.getAddress(), wei(10));
    });

    it('should return correct amount', async () => {
      expect(await swap.getEstimatedMorForStETH.staticCall(wei(1))).to.equal(wei(2));
    });
  });

  describe('#editParams', () => {
    it('should edit params', async () => {
      const newParams: Swap.SwapParamsStruct = {
        tokenIn: ZERO_ADDR,
        tokenOut: ZERO_ADDR,
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await swap.editParams(newParams);

      const params = await swap.params();

      expect(params.tokenIn).to.equal(newParams.tokenIn);
      expect(params.tokenOut).to.equal(newParams.tokenOut);
      expect(params.fee).to.equal(newParams.fee);
      expect(params.sqrtPriceLimitX96).to.equal(newParams.sqrtPriceLimitX96);
    });

    it('should set new allowance', async () => {
      expect(await stETH.allowance(swap, uniswapV2Router)).to.equal(ethers.MaxUint256);
      expect(await mor.allowance(swap, uniswapV2Router)).to.equal(0);

      const newParams: Swap.SwapParamsStruct = {
        tokenIn: mor,
        tokenOut: ZERO_ADDR,
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await swap.editParams(newParams);

      expect(await stETH.allowance(swap, uniswapV2Router)).to.equal(0);
      expect(await mor.allowance(swap, uniswapV2Router)).to.equal(ethers.MaxUint256);
    });
  });

  describe('#getExactInputSingleParams', () => {
    it('should return correct params', async () => {
      const params = await swap.getExactInputSingleParams(wei(2), wei(1));

      expect(params.tokenIn).to.equal(await stETH.getAddress());
      expect(params.tokenOut).to.equal(await mor.getAddress());
      expect(params.fee).to.equal(fee);
      expect(params.recipient).to.equal(await OWNER.getAddress());
      expect(params.deadline).to.equal(await getCurrentBlockTime());
      expect(params.amountIn).to.equal(wei(2));
      expect(params.amountOutMinimum).to.equal(wei(1));
      expect(params.sqrtPriceLimitX96).to.equal(sqrtPriceLimitX96ts);
    });
  });

  describe('#swapStETHForMor', () => {
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
      const tx = await swap.swapStETHForMor(wei(1), wei(1));

      expect(tx).to.changeTokenBalance(mor, OWNER, wei(2));
      expect(tx).to.changeTokenBalance(stETH, OWNER, wei(-1));
    });
  });
});

export const _getDefaultSwapParams = (tokenIn: string, tokenOut: string): Swap.SwapParamsStruct => {
  return {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: 0,
    sqrtPriceLimitX96: 0,
  };
};

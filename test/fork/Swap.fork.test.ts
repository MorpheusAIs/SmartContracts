import {
  IQuoter,
  IQuoter__factory,
  ISwapRouter,
  ISwapRouter__factory,
  MOR,
  MOR__factory,
  StETHMock,
  StETHMock__factory,
  Swap,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';
import { _getDefaultPool } from '../Distribution.test';
import { getCurrentBlockTime } from '../helpers/block-helper';
import { Reverter } from '../helpers/reverter';

describe('Swap', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;

  let swap: Swap;

  const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const quoterAddress = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

  const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const weth9Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const daiToWethRatio = wei(0.00049);

  const richAddress = '0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8';

  let swapRouter: ISwapRouter;
  let quoter: IQuoter;

  let stETH: StETHMock;
  let mor: MOR;

  let fee = 10000;
  let sqrtPriceLimitX96ts = 0;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);

    swapRouter = ISwapRouter__factory.connect(swapRouterAddress, OWNER);
    quoter = IQuoter__factory.connect(quoterAddress, OWNER);

    stETH = StETHMock__factory.connect(daiAddress, OWNER);
    mor = MOR__factory.connect(weth9Address, OWNER);

    const Swap = await ethers.getContractFactory('Swap', OWNER);
    swap = await Swap.deploy(
      swapRouter,
      quoter,
      _getDefaultSwapParams(await stETH.getAddress(), await mor.getAddress())
    );

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('constructor', () => {
    it('should set swapRouter', async () => {
      expect(await swap.swapRouter()).to.equal(await swapRouter.getAddress());
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
      expect(await stETH.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
    });
  });

  describe('#getEstimatedMorForStETH', () => {
    beforeEach('setup', async () => {
      await stETH.approve(await swap.getAddress(), wei(5));
    });

    it('should return correct amount', async () => {
      expect(await swap.getEstimatedMorForStETH.staticCall(wei(1))).to.be.closeTo(daiToWethRatio, wei(1, 13));
    });
  });

  describe('#editParams', () => {
    it('should edit params', async () => {
      const newParams: Swap.SwapParamsStruct = {
        tokenIn: await stETH.getAddress(),
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
      expect(await stETH.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
      expect(await mor.allowance(swap, swapRouter)).to.equal(0);

      const newParams: Swap.SwapParamsStruct = {
        tokenIn: mor,
        tokenOut: ZERO_ADDR,
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await swap.editParams(newParams);

      expect(await stETH.allowance(swap, swapRouter)).to.equal(0);
      expect(await mor.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
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
      await stETH.connect(OWNER).approve(await swap.getAddress(), ethers.MaxUint256);
    });

    it('should swap tokens', async () => {
      const amount = wei(0.0001);
      const tx = await swap.swapStETHForMor(amount, wei(0));

      expect(tx).to.changeTokenBalance(mor, OWNER, amount);
      expect(tx).to.changeTokenBalance(stETH, OWNER, -amount * daiToWethRatio);
    });
  });
});

export const _getDefaultSwapParams = (tokenIn: string, tokenOut: string): Swap.SwapParamsStruct => {
  return {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: 10000,
    sqrtPriceLimitX96: 0,
  };
};

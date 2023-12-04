import {
  ISwapRouter,
  ISwapRouter__factory,
  MOR,
  MOR__factory,
  StETHMock,
  StETHMock__factory,
  Swap,
  WStETHMock,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { ISwap } from '@/generated-types/ethers/contracts/Swap';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';
import { getDefaultSwapParams } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

describe('Swap', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let swap: Swap;

  const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

  const stethAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const wstethToUsdcRatio = wei(2399.01);

  const richAddress = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  let swapRouter: ISwapRouter;

  let inputToken: StETHMock;
  let outputToken: MOR;
  let intermediateToken: WStETHMock;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [SECOND] = await ethers.getSigners();

    swapRouter = ISwapRouter__factory.connect(swapRouterAddress, OWNER);

    inputToken = StETHMock__factory.connect(stethAddress, OWNER);
    outputToken = MOR__factory.connect(usdcAddress, OWNER);
    intermediateToken = WStETHMock__factory.connect(wstethAddress, OWNER);

    const Swap = await ethers.getContractFactory('Swap', OWNER);
    swap = await Swap.deploy(
      swapRouter,
      getDefaultSwapParams(
        await inputToken.getAddress(),
        await outputToken.getAddress(),
        await intermediateToken.getAddress(),
      ),
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
    it('should set router', async () => {
      expect(await swap.router()).to.equal(await swapRouter.getAddress());
    });

    it('should set params', async () => {
      const defaultParams = getDefaultSwapParams(
        await inputToken.getAddress(),
        await outputToken.getAddress(),
        await intermediateToken.getAddress(),
      );
      const params = await swap.params();

      expect(params.tokenIn).to.equal(defaultParams.tokenIn);
      expect(params.tokenOut).to.equal(defaultParams.tokenOut);
      expect(params.intermediateToken).to.equal(defaultParams.intermediateToken);
      expect(params.fee).to.equal(defaultParams.fee);
      expect(params.sqrtPriceLimitX96).to.equal(defaultParams.sqrtPriceLimitX96);
    });

    it('should give allowance to uniswapRouter', async () => {
      expect(await intermediateToken.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
    });
  });

  describe('supportsInterface', () => {
    it('should support ISwap', async () => {
      expect(await swap.supportsInterface('0xe48aaa86')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await swap.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('#editParams', () => {
    it('should edit params', async () => {
      const newParams: ISwap.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        intermediateToken: await intermediateToken.getAddress(),
        tokenOut: await intermediateToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await swap.editParams(newParams);

      const params = await swap.params();

      expect(params.tokenIn).to.equal(newParams.tokenIn);
      expect(params.tokenOut).to.equal(newParams.tokenOut);
      expect(params.intermediateToken).to.equal(newParams.intermediateToken);
      expect(params.fee).to.equal(newParams.fee);
      expect(params.sqrtPriceLimitX96).to.equal(newParams.sqrtPriceLimitX96);
    });

    it('should set new allowance', async () => {
      expect(await inputToken.allowance(swap, swapRouter)).to.equal(0);
      expect(await intermediateToken.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
      expect(await inputToken.allowance(swap, intermediateToken)).to.equal(ethers.MaxUint256);
      expect(await outputToken.allowance(swap, swapRouter)).to.equal(0);

      const newParams: ISwap.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        tokenOut: await inputToken.getAddress(),
        intermediateToken: await inputToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await swap.editParams(newParams);

      expect(await outputToken.allowance(swap, swapRouter)).to.equal(0);
      expect(await inputToken.allowance(swap, swapRouter)).to.equal(ethers.MaxUint256);
      expect(await outputToken.allowance(swap, inputToken)).to.equal(ethers.MaxUint256);
      expect(await outputToken.allowance(swap, swapRouter)).to.equal(0);
    });

    it('should revert if caller is not owner', async () => {
      await expect(
        swap.connect(SECOND).editParams(getDefaultSwapParams(ZERO_ADDR, ZERO_ADDR, ZERO_ADDR)),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert if tokenIn is zero address', async () => {
      await expect(
        swap.editParams(
          getDefaultSwapParams(ZERO_ADDR, await outputToken.getAddress(), await intermediateToken.getAddress()),
        ),
      ).to.be.revertedWith('Swap: invalid tokenIn');
    });

    it('should revert if tokenOut is zero address', async () => {
      await expect(
        swap.editParams(
          getDefaultSwapParams(await inputToken.getAddress(), ZERO_ADDR, await intermediateToken.getAddress()),
        ),
      ).to.be.revertedWith('Swap: invalid tokenOut');
    });

    it('should revert if intermediateToken is zero address', async () => {
      await expect(
        swap.editParams(getDefaultSwapParams(await inputToken.getAddress(), await outputToken.getAddress(), ZERO_ADDR)),
      ).to.be.revertedWith('Swap: invalid intermediateToken');
    });
  });

  describe('#swap', () => {
    beforeEach('setup', async () => {
      await inputToken.connect(OWNER).approve(await swap.getAddress(), ethers.MaxUint256);
    });

    it('should swap tokens', async () => {
      const amount = wei(0.0001);

      const tx = await swap.swap(amount, wei(0));

      expect(tx).to.changeTokenBalance(outputToken, OWNER, amount);
      expect(tx).to.changeTokenBalance(inputToken, OWNER, -amount * wstethToUsdcRatio);
    });
  });
});

// npx hardhat test "test/fork/Swap.fork.test.ts"

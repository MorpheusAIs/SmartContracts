import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';

import { getDefaultSwapParams } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import {
  IERC20,
  IERC20__factory,
  INonfungiblePositionManager,
  INonfungiblePositionManager__factory,
  ISwapRouter,
  ISwapRouter__factory,
  L2TokenReceiver,
  WStETHMock,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('L2TokenReceiver Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;

  let l2TokenReceiver: L2TokenReceiver;

  const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const nonfungiblePositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const wstethToUsdcRatio = wei(2399.01);

  const richAddress = '0x176F3DAb24a159341c0509bB36B833E7fdd0a132';

  let swapRouter: ISwapRouter;
  let nonfungiblePositionManager: INonfungiblePositionManager;

  let inputToken: WStETHMock;
  let outputToken: IERC20;

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
    nonfungiblePositionManager = INonfungiblePositionManager__factory.connect(nonfungiblePositionManagerAddress, OWNER);

    inputToken = WStETHMock__factory.connect(wstethAddress, OWNER);
    outputToken = IERC20__factory.connect(usdcAddress, OWNER);

    const L2TokenReceiver = await ethers.getContractFactory('L2TokenReceiver', OWNER);
    l2TokenReceiver = await L2TokenReceiver.deploy(
      swapRouter,
      nonfungiblePositionManager,
      getDefaultSwapParams(await inputToken.getAddress(), await outputToken.getAddress()),
    );

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#swap', () => {
    const amount = wei(0.0001);
    beforeEach('setup', async () => {
      await inputToken.transfer(l2TokenReceiver, amount);
    });

    it('should swap tokens', async () => {
      const tx = await l2TokenReceiver.swap(amount, wei(0));

      expect(tx).to.changeTokenBalance(outputToken, OWNER, amount);
      expect(tx).to.changeTokenBalance(inputToken, OWNER, -amount * wstethToUsdcRatio);
    });
  });

  describe('#increaseLiquidityCurrentRange', () => {
    const amountInputToken = wei(0.0001);
    const amoutOutputToken = 541774411822;

    // const poolId = '0x4622df6fb2d9bee0dcdacf545acdb6a2b2f4f863';
    const poolId = 376582;
    beforeEach('setup', async () => {
      await inputToken.transfer(l2TokenReceiver, amountInputToken);
      await outputToken.transfer(l2TokenReceiver, amoutOutputToken);
    });

    it('should increase liquidity', async () => {
      const tx = await l2TokenReceiver.increaseLiquidityCurrentRange.staticCall(
        poolId,
        amountInputToken,
        amoutOutputToken,
      );

      await l2TokenReceiver.increaseLiquidityCurrentRange(poolId, amountInputToken, amoutOutputToken);

      expect(tx).to.changeTokenBalance(outputToken, OWNER, -tx[1]);
      expect(tx).to.changeTokenBalance(inputToken, OWNER, -tx[2]);
    });
  });
});

// npx hardhat test "test/fork/Swap.fork.test.ts"

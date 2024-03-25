import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';

import { getCurrentBlockTime } from '../helpers/block-helper';
import { getDefaultSwapParams } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

import {
  IERC20,
  IERC20__factory,
  IL2TokenReceiver,
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
          blockNumber: 19000000,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);

    swapRouter = ISwapRouter__factory.connect(swapRouterAddress, OWNER);
    nonfungiblePositionManager = INonfungiblePositionManager__factory.connect(nonfungiblePositionManagerAddress, OWNER);

    inputToken = WStETHMock__factory.connect(wstethAddress, OWNER);
    outputToken = IERC20__factory.connect(usdcAddress, OWNER);

    const [ERC1967ProxyFactory, L2TokenReceiver] = await Promise.all([
      ethers.getContractFactory('ERC1967Proxy', OWNER),
      ethers.getContractFactory('L2TokenReceiver', OWNER),
    ]);

    const l2TokenReceiverImplementation = await L2TokenReceiver.deploy();
    const l2TokenReceiverProxy = await ERC1967ProxyFactory.deploy(l2TokenReceiverImplementation, '0x');
    l2TokenReceiver = L2TokenReceiver.attach(l2TokenReceiverProxy) as L2TokenReceiver;
    await l2TokenReceiver.L2TokenReceiver__init(
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
      const txResult = await l2TokenReceiver.swap.staticCall(amount, wei(0), (await getCurrentBlockTime()) + 100);
      const tx = await l2TokenReceiver.swap(amount, wei(0), (await getCurrentBlockTime()) + 100);

      await expect(tx).to.changeTokenBalance(outputToken, l2TokenReceiver, txResult);
      await expect(tx).to.changeTokenBalance(inputToken, l2TokenReceiver, -amount);
    });
  });

  describe('#increaseLiquidityCurrentRange', () => {
    const amountInputToken = wei(0.0001);
    const amountOutputToken = 541774411822;

    // const poolId = '0x4622df6fb2d9bee0dcdacf545acdb6a2b2f4f863';
    const poolId = 376582;
    beforeEach('setup', async () => {
      await inputToken.transfer(l2TokenReceiver, amountInputToken);
      await outputToken.transfer(l2TokenReceiver, amountOutputToken);
    });

    it('should increase liquidity', async () => {
      const txResult = await l2TokenReceiver.increaseLiquidityCurrentRange.staticCall(
        poolId,
        amountInputToken,
        amountOutputToken,
        0,
        0,
      );

      const tx = await l2TokenReceiver.increaseLiquidityCurrentRange(poolId, amountInputToken, amountOutputToken, 0, 0);

      await expect(tx).to.changeTokenBalance(outputToken, l2TokenReceiver, -txResult[2]);
      await expect(tx).to.changeTokenBalance(inputToken, l2TokenReceiver, -txResult[1]);
    });
    it('should set the amount correctly besides the tokens order', async () => {
      const newParams: IL2TokenReceiver.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        tokenOut: await inputToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await l2TokenReceiver.editParams(newParams);

      const txResult = await l2TokenReceiver.increaseLiquidityCurrentRange.staticCall(
        poolId,
        amountInputToken,
        amountOutputToken,
        0,
        0,
      );
      const tx = await l2TokenReceiver.increaseLiquidityCurrentRange(poolId, amountInputToken, amountOutputToken, 0, 0);

      await expect(tx).to.changeTokenBalance(inputToken, l2TokenReceiver, -txResult[1]);
      await expect(tx).to.changeTokenBalance(outputToken, l2TokenReceiver, -txResult[2]);
    });
  });

  describe('#collectFees', () => {
    const poolId = 376582;

    beforeEach('setup', async () => {
      const poolOwner = await nonfungiblePositionManager.ownerOf(poolId);
      const poolOwnerSigner = await ethers.getImpersonatedSigner(poolOwner);

      await OWNER.sendTransaction({ to: poolOwner, value: wei(10) });

      await nonfungiblePositionManager
        .connect(poolOwnerSigner)
        ['safeTransferFrom(address,address,uint256)'](poolOwner, l2TokenReceiver, poolId);
    });

    it('should collect fees', async () => {
      const outputTokenBalance = await outputToken.balanceOf(l2TokenReceiver);
      const inputTokenBalance = await inputToken.balanceOf(l2TokenReceiver);

      await l2TokenReceiver.collectFees(poolId);

      expect(await outputToken.balanceOf(l2TokenReceiver)).to.greaterThan(outputTokenBalance);
      expect(await inputToken.balanceOf(l2TokenReceiver)).to.greaterThan(inputTokenBalance);
    });
  });
});

// npx hardhat test "test/fork/L2TokenReceiver.fork.test.ts"

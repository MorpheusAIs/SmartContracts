import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { assert } from 'console';
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
  L2TokenReceiverV2,
  MOROFT,
  WStETHMock,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('L2TokenReceiverV2 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let l2TokenReceiver: L2TokenReceiverV2;

  const nonfungiblePositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

  const l1LzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fe728c';

  const wethAddress = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const richAddress = '0xE74546162c7c58929b898575C378Fd7EC5B16998';

  let nonfungiblePositionManager: INonfungiblePositionManager;

  let inputToken: WStETHMock;
  let innerToken: IERC20;
  let outputToken: MOROFT;

  let poolId: bigint;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 189500000,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [SECOND] = await ethers.getSigners();

    await SECOND.sendTransaction({ to: richAddress, value: wei(100) });

    nonfungiblePositionManager = INonfungiblePositionManager__factory.connect(nonfungiblePositionManagerAddress, OWNER);

    const [L2TokenReceiverV2, MOR] = await Promise.all([
      ethers.getContractFactory('L2TokenReceiverV2', OWNER),
      ethers.getContractFactory('MOROFT', OWNER),
    ]);

    l2TokenReceiver = L2TokenReceiverV2.attach('0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790') as L2TokenReceiverV2;

    // Upgrade to V2
    const contractOwner = await ethers.getImpersonatedSigner(await l2TokenReceiver.owner());
    await SECOND.sendTransaction({ to: contractOwner, value: wei(100) });
    await l2TokenReceiver.connect(contractOwner).transferOwnership(OWNER);

    const l2TokenReceiverImplementationV2 = await L2TokenReceiverV2.deploy();
    await l2TokenReceiver.upgradeTo(l2TokenReceiverImplementationV2);

    l2TokenReceiver = L2TokenReceiverV2.attach(l2TokenReceiver) as L2TokenReceiverV2;

    innerToken = IERC20__factory.connect(wethAddress, OWNER);
    inputToken = WStETHMock__factory.connect((await l2TokenReceiver.secondSwapParams()).tokenIn, OWNER);
    outputToken = (await MOR.deploy(l1LzEndpointV2Address, OWNER, OWNER)).connect(OWNER);

    await outputToken.mint(OWNER, wei(1000));

    await l2TokenReceiver.editParams(
      getDefaultSwapParams(await innerToken.getAddress(), await outputToken.getAddress()),
      false,
    );
    await l2TokenReceiver.editParams(
      getDefaultSwapParams(await inputToken.getAddress(), await innerToken.getAddress()),
      true,
    );

    // Create a pool

    await innerToken.approve(nonfungiblePositionManagerAddress, wei(1000));
    await outputToken.approve(nonfungiblePositionManagerAddress, wei(1000));

    const sqrtPrice = 2505413655765166104103837312489n;

    await nonfungiblePositionManager.createAndInitializePoolIfNecessary(innerToken, outputToken, 500, sqrtPrice);

    poolId = (
      await nonfungiblePositionManager.mint.staticCall({
        token0: innerToken,
        token1: outputToken,
        fee: 500,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: wei(0.01),
        amount1Desired: 9999993390433544889n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: OWNER,
        deadline: (await getCurrentBlockTime()) + 100,
      })
    ).tokenId;

    await nonfungiblePositionManager.mint({
      token0: innerToken,
      token1: outputToken,
      fee: 500,
      tickLower: -887220,
      tickUpper: 887220,
      amount0Desired: wei(0.01),
      amount1Desired: 9999993390433544889n,
      amount0Min: 0,
      amount1Min: 0,
      recipient: OWNER,
      deadline: (await getCurrentBlockTime()) + 100,
    });

    await nonfungiblePositionManager['safeTransferFrom(address,address,uint256)'](OWNER, l2TokenReceiver, poolId);
    assert((await l2TokenReceiver.version()) === 2n, 'L2TokenReceiver should be upgraded to V2');

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#swap', () => {
    const amount = wei(0.00001);
    beforeEach('setup', async () => {
      await inputToken.transfer(l2TokenReceiver, amount);
      await innerToken.transfer(l2TokenReceiver, amount);
    });

    it('should swap tokens 1', async () => {
      const txResult = await l2TokenReceiver.swap.staticCall(amount, 0, (await getCurrentBlockTime()) + 100, true);
      const tx = await l2TokenReceiver.swap(amount, 0, (await getCurrentBlockTime()) + 100, true);

      await expect(tx).to.changeTokenBalance(innerToken, l2TokenReceiver, txResult);
      await expect(tx).to.changeTokenBalance(inputToken, l2TokenReceiver, -amount);
    });
    it('should swap tokens 2', async () => {
      const txResult = await l2TokenReceiver.swap.staticCall(amount, 0, (await getCurrentBlockTime()) + 100, false);
      const tx = await l2TokenReceiver.swap(amount, 0, (await getCurrentBlockTime()) + 100, false);

      await expect(tx).to.changeTokenBalance(outputToken, l2TokenReceiver, txResult);
      await expect(tx).to.changeTokenBalance(innerToken, l2TokenReceiver, -amount);
    });
  });

  describe('#increaseLiquidityCurrentRange', () => {
    const amountInputToken = wei(0.00001);
    const amountOutputToken = wei(0.1);

    beforeEach('setup', async () => {
      await innerToken.transfer(l2TokenReceiver, amountInputToken);
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
      await expect(tx).to.changeTokenBalance(innerToken, l2TokenReceiver, -txResult[1]);
    });
    it('should set the amount correctly besides the tokens order', async () => {
      const newParams: IL2TokenReceiver.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        tokenOut: await innerToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await l2TokenReceiver.editParams(newParams, false);

      const txResult = await l2TokenReceiver.increaseLiquidityCurrentRange.staticCall(
        poolId,
        amountInputToken,
        amountOutputToken,
        0,
        0,
      );
      const tx = await l2TokenReceiver.increaseLiquidityCurrentRange(poolId, amountInputToken, amountOutputToken, 0, 0);

      await expect(tx).to.changeTokenBalance(innerToken, l2TokenReceiver, -txResult[1]);
      await expect(tx).to.changeTokenBalance(outputToken, l2TokenReceiver, -txResult[2]);
    });
  });

  describe('#collectFees', () => {
    beforeEach('setup', async () => {
      await innerToken.transfer(l2TokenReceiver, wei(0.001));

      await l2TokenReceiver.swap(wei(0.0001), 0, (await getCurrentBlockTime()) + 100, false);
    });

    it('should collect fees', async () => {
      const outputTokenBalance = await outputToken.balanceOf(l2TokenReceiver);
      const inputTokenBalance = await innerToken.balanceOf(l2TokenReceiver);

      await l2TokenReceiver.collectFees(poolId);

      expect(await outputToken.balanceOf(l2TokenReceiver)).to.be.equal(outputTokenBalance);
      expect(await innerToken.balanceOf(l2TokenReceiver)).to.be.greaterThan(inputTokenBalance);
    });
  });

  describe('#withdrawTokenId', () => {
    it('should withdraw position NFT', async () => {
      expect(await nonfungiblePositionManager.ownerOf(poolId)).to.be.equal(await l2TokenReceiver.getAddress());

      await l2TokenReceiver.withdrawTokenId(OWNER, nonfungiblePositionManager, poolId);

      expect(await nonfungiblePositionManager.ownerOf(poolId)).to.be.equal(await OWNER.getAddress());
    });
  });
});

// npx hardhat test "test/fork/L2TokenReceiverV2.fork.test.ts"

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { getDefaultSwapParams } from '../../helpers/distribution-helper';
import { Reverter } from '../../helpers/reverter';

import {
  IL2TokenReceiver,
  L2TokenReceiver,
  L2TokenReceiverV2,
  MOR,
  NonfungiblePositionManagerMock,
  StETHMock,
  UniswapSwapRouterMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('L2TokenReceiver', () => {
  const reverter = new Reverter();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let swapRouter: UniswapSwapRouterMock;
  let nonfungiblePositionManager: NonfungiblePositionManagerMock;

  let l2TokenReceiver: L2TokenReceiver;
  let inputToken: StETHMock;
  let outputToken: MOR;
  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const [ERC1967ProxyFactory, L2TokenReceiver, StETHMock, Mor, SwapRouterMock, NonfungiblePositionManagerMock] =
      await Promise.all([
        ethers.getContractFactory('ERC1967Proxy'),
        ethers.getContractFactory('L2TokenReceiver'),
        ethers.getContractFactory('StETHMock'),
        ethers.getContractFactory('MOR'),
        ethers.getContractFactory('UniswapSwapRouterMock'),
        ethers.getContractFactory('NonfungiblePositionManagerMock'),
      ]);

    let l2TokenReceiverImplementation: L2TokenReceiver;

    [inputToken, outputToken, swapRouter, nonfungiblePositionManager, l2TokenReceiverImplementation] =
      await Promise.all([
        StETHMock.deploy(),
        Mor.deploy(wei(100)),
        SwapRouterMock.deploy(),
        NonfungiblePositionManagerMock.deploy(),
        L2TokenReceiver.deploy(),
      ]);

    const l2TokenReceiverProxy = await ERC1967ProxyFactory.deploy(l2TokenReceiverImplementation, '0x');
    l2TokenReceiver = L2TokenReceiver.attach(l2TokenReceiverProxy) as L2TokenReceiver;
    await l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, {
      tokenIn: inputToken,
      tokenOut: outputToken,
      fee: 500,
      sqrtPriceLimitX96: 0,
    });

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('UUPS proxy functionality', () => {
    it('should disable initialize function', async () => {
      const reason = 'Initializable: contract is already initialized';

      const l2TokenReceiver = await (await ethers.getContractFactory('L2TokenReceiver')).deploy();

      await expect(
        l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, {
          tokenIn: inputToken,
          tokenOut: outputToken,
          fee: 500,
          sqrtPriceLimitX96: 0,
        }),
      ).to.be.rejectedWith(reason);
    });

    describe('#L2TokenReceiver__init', () => {
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(
          l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, {
            tokenIn: inputToken,
            tokenOut: outputToken,
            fee: 500,
            sqrtPriceLimitX96: 0,
          }),
        ).to.be.rejectedWith(reason);
      });
      it('should set router', async () => {
        expect(await l2TokenReceiver.router()).to.equal(await swapRouter.getAddress());
      });
      it('should set params', async () => {
        const defaultParams = getDefaultSwapParams(await inputToken.getAddress(), await outputToken.getAddress());
        const params = await l2TokenReceiver.params();

        expect(params.tokenIn).to.equal(defaultParams.tokenIn);
        expect(params.tokenOut).to.equal(defaultParams.tokenOut);
        expect(params.fee).to.equal(defaultParams.fee);
        expect(params.sqrtPriceLimitX96).to.equal(defaultParams.sqrtPriceLimitX96);
      });
      it('should give allowance', async () => {
        expect(await inputToken.allowance(l2TokenReceiver, swapRouter)).to.equal(ethers.MaxUint256);
        expect(await inputToken.allowance(l2TokenReceiver, nonfungiblePositionManager)).to.equal(ethers.MaxUint256);
        expect(await outputToken.allowance(l2TokenReceiver, nonfungiblePositionManager)).to.equal(ethers.MaxUint256);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const l2TokenReceiverV2Factory = await ethers.getContractFactory('L2TokenReceiverV2');
        const l2TokenReceiverV2Implementation = await l2TokenReceiverV2Factory.deploy();

        await l2TokenReceiver.upgradeTo(l2TokenReceiverV2Implementation);

        const l2TokenReceiverV2 = l2TokenReceiverV2Factory.attach(l2TokenReceiver) as L2TokenReceiverV2;

        expect(await l2TokenReceiverV2.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(l2TokenReceiver.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IL2TokenReceiver', async () => {
      expect(await l2TokenReceiver.supportsInterface('0x067ef141')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await l2TokenReceiver.supportsInterface('0x01ffc9a7')).to.be.true;
    });
    it('should support IERC721Receiver', async () => {
      expect(await l2TokenReceiver.supportsInterface('0x150b7a02')).to.be.true;
    });
  });

  describe('#editParams', () => {
    it('should edit params', async () => {
      const newParams: IL2TokenReceiver.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        tokenOut: await inputToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await l2TokenReceiver.editParams(newParams);

      const params = await l2TokenReceiver.params();

      expect(params.tokenIn).to.equal(newParams.tokenIn);
      expect(params.tokenOut).to.equal(newParams.tokenOut);
      expect(params.fee).to.equal(newParams.fee);
      expect(params.sqrtPriceLimitX96).to.equal(newParams.sqrtPriceLimitX96);
    });
    it('should set new allowance', async () => {
      const newParams: IL2TokenReceiver.SwapParamsStruct = {
        tokenIn: await outputToken.getAddress(),
        tokenOut: await inputToken.getAddress(),
        fee: 1,
        sqrtPriceLimitX96: 1,
      };

      await l2TokenReceiver.editParams(newParams);

      expect(await inputToken.allowance(l2TokenReceiver, swapRouter)).to.equal(0);
      expect(await inputToken.allowance(l2TokenReceiver, nonfungiblePositionManager)).to.equal(ethers.MaxUint256);
      expect(await outputToken.allowance(l2TokenReceiver, swapRouter)).to.equal(ethers.MaxUint256);
      expect(await outputToken.allowance(l2TokenReceiver, nonfungiblePositionManager)).to.equal(ethers.MaxUint256);
    });
    it('should revert if caller is not owner', async () => {
      await expect(
        l2TokenReceiver.connect(SECOND).editParams(getDefaultSwapParams(ZERO_ADDR, ZERO_ADDR)),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert if tokenIn is zero address', async () => {
      await expect(
        l2TokenReceiver.editParams(getDefaultSwapParams(ZERO_ADDR, await outputToken.getAddress())),
      ).to.be.revertedWith('L2TR: invalid tokenIn');
    });
    it('should revert if tokenOut is zero address', async () => {
      await expect(
        l2TokenReceiver.editParams(getDefaultSwapParams(await inputToken.getAddress(), ZERO_ADDR)),
      ).to.be.revertedWith('L2TR: invalid tokenOut');
    });
  });

  describe('#swap', () => {
    it('should return if caller is not the owner', async () => {
      await expect(l2TokenReceiver.connect(SECOND).swap(1, 1, 1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#increaseLiquidityCurrentRange', () => {
    it('should return if caller is not the owner', async () => {
      await expect(l2TokenReceiver.connect(SECOND).increaseLiquidityCurrentRange(1, 1, 1, 0, 0)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });
});

// npx hardhat test "test/L2TokenReceiver.test.ts"

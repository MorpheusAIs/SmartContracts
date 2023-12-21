import {
  INonfungiblePositionManager,
  INonfungiblePositionManager__factory,
  ISwapRouter,
  ISwapRouter__factory,
  L2TokenReceiver,
  MOR,
  MOR__factory,
  WStETHMock,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';
import { getDefaultSwapParams } from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

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
  let outputToken: MOR;

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
    outputToken = MOR__factory.connect(usdcAddress, OWNER);

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
});

// npx hardhat test "test/fork/Swap.fork.test.ts"

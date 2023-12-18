import {
  IGatewayRouter,
  IGatewayRouter__factory,
  IStETH,
  IStETH__factory,
  IWStETH,
  IWStETH__factory,
  L1Sender,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Reverter } from '../helpers/reverter';

describe('L1Sender', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  const l1GatewayRouterAddress = '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef';
  const lzEndpointAddress = '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675';
  const stethAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

  const richAddress = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  let l1GatewayRouter: IGatewayRouter;
  let l1Sender: L1Sender;

  let steth: IStETH;
  let depositToken: IWStETH;
  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        },
      },
    ]);

    OWNER = await ethers.getImpersonatedSigner(richAddress);
    [, SECOND] = await ethers.getSigners();

    l1GatewayRouter = IGatewayRouter__factory.connect(l1GatewayRouterAddress, OWNER);
    depositToken = IWStETH__factory.connect(wstethAddress, OWNER);
    steth = IStETH__factory.connect(stethAddress, OWNER);

    const L1Sender = await ethers.getContractFactory('L1Sender', OWNER);
    l1Sender = await L1Sender.deploy(l1GatewayRouter, depositToken, {
      lzEndpoint: lzEndpointAddress,
      communicator: ZERO_ADDR,
      communicatorChainId: 110, // Arbitrum
    });

    await steth.approve(depositToken, ethers.MaxUint256);
    await depositToken.wrap(wei(100));

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('constructor', () => {
    it('should set the depositToken', async () => {
      expect(await l1Sender.depositToken()).to.equal(await depositToken.getAddress());
    });
    it('should set the router', async () => {
      expect(await l1Sender.l1GatewayRouter()).to.equal(await l1GatewayRouter.getAddress());
    });
  });

  describe('sendTokensOnSwap', () => {
    beforeEach(async () => {
      await depositToken.approve(l1Sender, ethers.MaxUint256);
    });
    it('should bridge depositTokens', async () => {
      const amount = wei(0.01);
      const gasLimit = 1_000_000; // about 72_000
      const maxFeePerGas = 1_000_000_000; // always 300_000_000
      const maxSubmissionCost = 1_000_000_000_000_000; // different
      //                          738_253_009_388_160
      //                          290_990_833_929_152

      await l1Sender.sendTokensOnSwap.staticCall(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });

      await l1Sender.sendTokensOnSwap(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });
    });
  });

  describe('sendMintMessage', () => {
    it('should just sendMintMessage', async () => {
      await l1Sender.sendMintMessage(SECOND, wei(1), {
        value: wei(1),
      });
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).sendMintMessage(SECOND, wei(1), {
          value: wei(1),
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

import {
  Bridge,
  IGatewayRouter,
  IGatewayRouter__factory,
  IStETH,
  IStETH__factory,
  IWStETH,
  IWStETH__factory,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {} from '../helpers/distribution-helper';
import { Reverter } from '../helpers/reverter';

describe.only('Bridge', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  const l1GatewayRouterAddress = '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef';
  const lzEndpointAddress = '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675';
  const stethAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

  const richAddress = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  let l1GatewayRouter: IGatewayRouter;
  let bridge: Bridge;

  let steth: IStETH;
  let investToken: IWStETH;
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
    investToken = IWStETH__factory.connect(wstethAddress, OWNER);
    steth = IStETH__factory.connect(stethAddress, OWNER);

    const Bridge = await ethers.getContractFactory('Bridge', OWNER);
    bridge = await Bridge.deploy(l1GatewayRouter, investToken, {
      lzEndpoint: lzEndpointAddress,
      communicator: ZERO_ADDR,
      communicatorChainId: 110, // Arbitrum
    });

    await steth.approve(investToken, ethers.MaxUint256);
    await investToken.wrap(wei(100));

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('constructor', () => {
    it('should set the investToken', async () => {
      expect(await bridge.investToken()).to.equal(await investToken.getAddress());
    });
    it('should set the router', async () => {
      expect(await bridge.l1GatewayRouter()).to.equal(await l1GatewayRouter.getAddress());
    });
  });

  describe('bridgeInvestTokens', () => {
    beforeEach(async () => {
      await investToken.approve(bridge, ethers.MaxUint256);
    });
    it('should bridge investTokens', async () => {
      const amount = wei(0.01);
      const gasLimit = 1_000_000; // about 72_000
      const maxFeePerGas = 1_000_000_000; // always 300_000_000
      const maxSubmissionCost = 1_000_000_000_000_000; // different
      //                          738_253_009_388_160
      //                          290_990_833_929_152

      await bridge.bridgeInvestTokens.staticCall(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });

      await bridge.bridgeInvestTokens(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });
    });
  });

  describe('sendMintRewardMessage', () => {
    it('should just sendMintRewardMessage', async () => {
      await bridge.sendMintRewardMessage(SECOND, wei(1), {
        value: wei(1),
      });
    });
  });
});

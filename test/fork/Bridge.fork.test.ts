import {
  Bridge,
  IL1GatewayRouter,
  IL1GatewayRouter__factory,
  IStETH,
  IStETH__factory,
  IWStETH,
  IWStETH__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Reverter } from '../helpers/reverter';

describe('Bridge', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  const l1GatewayRouterAddress = '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef';
  const stethAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

  const richAddress = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  let l1GatewayRouter: IL1GatewayRouter;
  let bridge: Bridge;

  let token: IWStETH;
  let steth: IStETH;
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

    l1GatewayRouter = IL1GatewayRouter__factory.connect(l1GatewayRouterAddress, OWNER);
    token = IWStETH__factory.connect(wstethAddress, OWNER);
    steth = IStETH__factory.connect(stethAddress, OWNER);

    const Bridge = await ethers.getContractFactory('Bridge', OWNER);
    bridge = await Bridge.deploy(l1GatewayRouter, token);

    await steth.approve(token, ethers.MaxUint256);
    await token.wrap(wei(100));

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('constructor', () => {
    it('should set the token', async () => {
      expect(await bridge.token()).to.equal(await token.getAddress());
    });
    it('should set the router', async () => {
      expect(await bridge.l1GatewayRouter()).to.equal(await l1GatewayRouter.getAddress());
    });
  });

  describe('bridgeTokens', () => {
    beforeEach(async () => {
      await token.approve(bridge, ethers.MaxUint256);
    });
    it('should bridge tokens', async () => {
      const amount = wei(0.01);
      const gasLimit = 1_000_000; // about 72_000
      const maxFeePerGas = 1_000_000_000; // always 300_000_000
      const maxSubmissionCost = 1_000_000_000_000_000; // different
      //                          738_253_009_388_160
      //                          290_990_833_929_152

      const tx = await bridge.bridgeTokens.staticCall(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });
      console.log(tx);

      await bridge.bridgeTokens(amount, SECOND, gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });
    });
  });
});

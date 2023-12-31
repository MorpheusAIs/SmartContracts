import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../helpers/reverter';

import {
  IGatewayRouter,
  IGatewayRouter__factory,
  IStETH,
  IStETH__factory,
  IWStETH,
  IWStETH__factory,
  L1Sender,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('L1Sender Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  const arbitrumBridgeGatewayRouterAddress = '0x0F25c1DC2a9922304f2eac71DCa9B07E310e8E5a';
  const lzEndpointAddress = '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675';
  const stethAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  const wstethAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

  const richAddress = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';

  let arbitrumBridgeGatewayRouter: IGatewayRouter;
  let l1Sender: L1Sender;

  let steth: IStETH;
  let wsteth: IWStETH;
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

    arbitrumBridgeGatewayRouter = IGatewayRouter__factory.connect(arbitrumBridgeGatewayRouterAddress, OWNER);
    wsteth = IWStETH__factory.connect(wstethAddress, OWNER);
    steth = IStETH__factory.connect(stethAddress, OWNER);

    const L1Sender = await ethers.getContractFactory('L1Sender', OWNER);
    l1Sender = await L1Sender.deploy();

    await l1Sender.setDepositTokenConfig({
      token: wsteth,
      gateway: arbitrumBridgeGatewayRouter,
      receiver: SECOND,
    });

    await l1Sender.setRewardTokenConfig({
      gateway: lzEndpointAddress,
      receiver: SECOND,
      receiverChainId: 110,
    });

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('sendDepositToken', () => {
    it('should bridge depositTokens', async () => {
      const amount = wei(0.01);
      await steth.transfer(l1Sender, amount);
      const gasLimit = 1_000_000;
      const maxFeePerGas = 1_000_000_000;
      const maxSubmissionCost = 1_000_000_000_000_000;

      const tokenBalanceBefore = await steth.balanceOf(l1Sender);

      await l1Sender.sendDepositToken(gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });

      const tokenBalanceAfter = await steth.balanceOf(l1Sender);
      expect(tokenBalanceAfter - tokenBalanceBefore).to.closeTo(-amount, wei(0.0001));
    });
  });

  describe('sendMintMessage', () => {
    it('should just sendMintMessage', async () => {
      await l1Sender.sendMintMessage(SECOND, wei(1), OWNER, {
        value: wei(1),
      });
    });
  });
});

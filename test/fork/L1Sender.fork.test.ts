import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../helpers/reverter';

import {
  IGatewayRouter,
  IGatewayRouter__factory,
  IL1Sender,
  IStETH,
  IStETH__factory,
  IWStETH,
  IWStETH__factory,
  L1Sender,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

describe('L1Sender Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  const arbitrumBridgeGatewayRouterAddress = '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef';
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

    const [ERC1967ProxyFactory, L1Sender] = await Promise.all([
      ethers.getContractFactory('ERC1967Proxy', OWNER),
      ethers.getContractFactory('L1Sender', OWNER),
    ]);

    const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
      gateway: lzEndpointAddress,
      receiver: SECOND,
      receiverChainId: 110,
      zroPaymentAddress: ZERO_ADDR,
      adapterParams: '0x',
    };
    const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
      token: wsteth,
      gateway: arbitrumBridgeGatewayRouter,
      receiver: SECOND,
    };

    const l1SenderImplementation = await L1Sender.deploy();
    const l1SenderProxy = await ERC1967ProxyFactory.deploy(l1SenderImplementation, '0x');
    l1Sender = L1Sender.attach(l1SenderProxy) as L1Sender;
    await l1Sender.L1Sender__init(OWNER, rewardTokenConfig, depositTokenConfig);

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

// npx hardhat test "test/fork/L1Sender.fork.test.ts"

import {
  GatewayRouterMock,
  L1Sender,
  L2MessageReceiver,
  LZEndpointMock,
  MOR,
  StETHMock,
  WStETHMock,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Reverter } from './helpers/reverter';

describe('L1Sender', () => {
  const senderChainId = 101;
  const receiverChainId = 110;

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let depositToken: WStETHMock;

  let lZEndpointMockSender: LZEndpointMock;
  let lZEndpointMockReceiver: LZEndpointMock;

  let gatewayRouter: GatewayRouterMock;

  let l1Sender: L1Sender;
  let l2MessageReceiver: L2MessageReceiver;

  let rewardToken: MOR;
  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const [LZEndpointMock, Mor, L1Sender, GatewayRouterMock, StETHMock, WStETHMock, L2MessageReceiver] =
      await Promise.all([
        ethers.getContractFactory('LZEndpointMock'),
        ethers.getContractFactory('MOR'),
        ethers.getContractFactory('L1Sender'),
        ethers.getContractFactory('GatewayRouterMock'),
        ethers.getContractFactory('StETHMock'),
        ethers.getContractFactory('WStETHMock'),
        ethers.getContractFactory('L2MessageReceiver'),
      ]);

    let stETH: StETHMock;
    [lZEndpointMockSender, lZEndpointMockReceiver, rewardToken, l1Sender, stETH, l2MessageReceiver] = await Promise.all(
      [
        LZEndpointMock.deploy(senderChainId),
        LZEndpointMock.deploy(receiverChainId),
        Mor.deploy(wei(100)),
        L1Sender.deploy(),
        StETHMock.deploy(),
        L2MessageReceiver.deploy(),
      ],
    );

    depositToken = await WStETHMock.deploy(stETH);

    gatewayRouter = await GatewayRouterMock.deploy(lZEndpointMockSender);

    await l1Sender.setDepositTokenConfig({
      token: depositToken,
      gateway: gatewayRouter,
      receiver: SECOND,
    });

    await l1Sender.setRewardTokenConfig({
      gateway: lZEndpointMockSender,
      receiver: l2MessageReceiver,
      receiverChainId: receiverChainId,
    });

    await lZEndpointMockSender.setDestLzEndpoint(l2MessageReceiver, lZEndpointMockReceiver);

    await rewardToken.transferOwnership(l2MessageReceiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('setRewardTokenConfig', () => {
    it('should set rewardTokenConfig', async () => {
      expect(await l1Sender.rewardTokenConfig()).to.be.deep.equal([
        await lZEndpointMockSender.getAddress(),
        await l2MessageReceiver.getAddress(),
        receiverChainId,
      ]);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).setRewardTokenConfig({
          gateway: lZEndpointMockSender,
          receiver: l2MessageReceiver,
          receiverChainId: receiverChainId,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setDepositTokenConfig', () => {
    it('should set depositTokenConfig', async () => {
      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await depositToken.getAddress(),
        await gatewayRouter.getAddress(),
        await SECOND.getAddress(),
      ]);
    });
    it('should set approve to gateway', async () => {
      expect(await depositToken.allowance(l1Sender, lZEndpointMockSender)).to.be.equal(ethers.MaxUint256);
    });
    it('should remove approve from old gateway', async () => {
      const GatewayRouterMock = await ethers.getContractFactory('GatewayRouterMock');
      const gatewayRouter2 = await GatewayRouterMock.deploy(SECOND);

      await l1Sender.setDepositTokenConfig({
        token: depositToken,
        gateway: gatewayRouter2,
        receiver: SECOND,
      });

      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);
      expect(await depositToken.allowance(l1Sender, SECOND)).to.be.equal(ethers.MaxUint256);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).setDepositTokenConfig({
          token: depositToken,
          gateway: lZEndpointMockSender,
          receiver: SECOND,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('sendMintMessage', () => {
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).sendMintMessage(SECOND, wei(1), OWNER, {
          value: wei(1),
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

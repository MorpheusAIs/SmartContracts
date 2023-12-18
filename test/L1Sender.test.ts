import { L1Sender, L2Receiver, LZEndpointMock, MOR } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
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

  let lZEndpointMockSender: LZEndpointMock;
  let lZEndpointMockReceiver: LZEndpointMock;

  let l1Sender: L1Sender;
  let l2Receiver: L2Receiver;

  let rewardToken: MOR;
  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();
    let depositToken;

    const [LZEndpointMock, L2Receiver, Mor, L1Sender, StETHMock, GatewayRouterMock] = await Promise.all([
      ethers.getContractFactory('LZEndpointMock'),
      ethers.getContractFactory('L2Receiver'),
      ethers.getContractFactory('MOR'),
      ethers.getContractFactory('L1Sender'),
      ethers.getContractFactory('StETHMock'),
      ethers.getContractFactory('GatewayRouterMock'),
    ]);

    [lZEndpointMockSender, lZEndpointMockReceiver, depositToken] = await Promise.all([
      LZEndpointMock.deploy(senderChainId),
      LZEndpointMock.deploy(receiverChainId),
      StETHMock.deploy(),
    ]);

    const gatewayRouterMock = await GatewayRouterMock.deploy(lZEndpointMockSender);

    rewardToken = await Mor.deploy(wei(100));

    l2Receiver = await L2Receiver.deploy(depositToken, rewardToken, OWNER, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: ZERO_ADDR,
      communicatorChainId: senderChainId,
    });

    l1Sender = await L1Sender.deploy(gatewayRouterMock, depositToken, {
      lzEndpoint: lZEndpointMockSender,
      communicator: l2Receiver,
      communicatorChainId: receiverChainId,
    });

    await l2Receiver.setParams(depositToken, rewardToken, OWNER, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: l1Sender,
      communicatorChainId: senderChainId,
    });

    await lZEndpointMockSender.setDestLzEndpoint(l2Receiver, lZEndpointMockReceiver);

    await rewardToken.transferOwnership(l2Receiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('sendMintMessage', () => {
    it('should sendMintMessage', async () => {
      expect(await l2Receiver.nonce()).to.equal(0);

      const amount = wei(1);

      const tx = await l1Sender.sendMintMessage(SECOND, amount, OWNER, { value: wei(0.5) });
      await expect(tx).changeTokenBalance(rewardToken, SECOND, amount);

      expect(await l2Receiver.nonce()).to.equal(1);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).sendMintMessage(SECOND, wei(1), OWNER, {
          value: wei(1),
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

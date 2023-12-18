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

    const [LZEndpointMock, L2Receiver, Mor, L1Sender, StETHMock] = await Promise.all([
      ethers.getContractFactory('LZEndpointMock', OWNER),
      ethers.getContractFactory('L2Receiver', OWNER),
      ethers.getContractFactory('MOR', OWNER),
      ethers.getContractFactory('L1Sender', OWNER),
      ethers.getContractFactory('StETHMock', OWNER),
    ]);

    [lZEndpointMockSender, lZEndpointMockReceiver, depositToken] = await Promise.all([
      LZEndpointMock.deploy(senderChainId),
      LZEndpointMock.deploy(receiverChainId),
      StETHMock.deploy(),
    ]);

    l2Receiver = await L2Receiver.deploy(depositToken, ZERO_ADDR, depositToken, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: ZERO_ADDR,
      communicatorChainId: senderChainId,
    });

    rewardToken = await Mor.deploy(wei(100));

    l1Sender = await L1Sender.deploy(ZERO_ADDR, ZERO_ADDR, {
      lzEndpoint: lZEndpointMockSender,
      communicator: l2Receiver,
      communicatorChainId: receiverChainId,
    });

    await l2Receiver.setParams(depositToken, rewardToken, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: l1Sender,
      communicatorChainId: senderChainId,
    });

    await lZEndpointMockSender.setDestLzEndpoint(l2Receiver, lZEndpointMockReceiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('sendMintMessage', () => {
    it('should sendMintMessage', async () => {
      expect(await l2Receiver.nonce()).to.equal(0);

      const amount = wei(1);

      const tx = await l1Sender.sendMintMessage(SECOND, amount, { value: wei(0.5) });
      await expect(tx).changeTokenBalance(rewardToken, SECOND, amount);
      expect(await l2Receiver.nonce()).to.equal(1);
    });
  });
});

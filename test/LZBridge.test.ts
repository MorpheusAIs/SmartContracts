import { Bridge, LZEndpointMock, MOR, TokenController } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Reverter } from './helpers/reverter';

describe('Bridge', () => {
  const senderChainId = 101;
  const receiverChainId = 110;

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let lZEndpointMockSender: LZEndpointMock;
  let lZEndpointMockReceiver: LZEndpointMock;

  let bridge: Bridge;
  let tokenController: TokenController;

  let rewardToken: MOR;
  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();
    let investToken;

    const [LZEndpointMock, TokenController, Mor, Bridge, StETHMock] = await Promise.all([
      ethers.getContractFactory('LZEndpointMock', OWNER),
      ethers.getContractFactory('TokenController', OWNER),
      ethers.getContractFactory('MOR', OWNER),
      ethers.getContractFactory('Bridge', OWNER),
      ethers.getContractFactory('StETHMock', OWNER),
    ]);

    [lZEndpointMockSender, lZEndpointMockReceiver, investToken] = await Promise.all([
      LZEndpointMock.deploy(senderChainId),
      LZEndpointMock.deploy(receiverChainId),
      StETHMock.deploy(),
    ]);

    tokenController = await TokenController.deploy(investToken, ZERO_ADDR, investToken, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: ZERO_ADDR,
      communicatorChainId: senderChainId,
    });

    rewardToken = await Mor.deploy(tokenController, wei(100));

    bridge = await Bridge.deploy(ZERO_ADDR, ZERO_ADDR, {
      lzEndpoint: lZEndpointMockSender,
      communicator: tokenController,
      communicatorChainId: receiverChainId,
    });

    await tokenController.setParams(investToken, rewardToken, {
      lzEndpoint: lZEndpointMockReceiver,
      communicator: bridge,
      communicatorChainId: senderChainId,
    });

    await lZEndpointMockSender.setDestLzEndpoint(tokenController, lZEndpointMockReceiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('sendMintRewardMessage', () => {
    it('should sendMintRewardMessage', async () => {
      expect(await tokenController.nonce()).to.equal(0);

      const amount = wei(1);

      const tx = await bridge.sendMintRewardMessage(SECOND, amount, { value: wei(0.5) });
      await expect(tx).changeTokenBalance(rewardToken, SECOND, amount);
      expect(await tokenController.nonce()).to.equal(1);
    });
  });
});
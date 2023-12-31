import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  GatewayRouterMock,
  L1Sender,
  L2MessageReceiver,
  LZEndpointMock,
  MOR,
  StETHMock,
  WStETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('L1Sender', () => {
  const senderChainId = 101;
  const receiverChainId = 110;

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let unwrappedToken: StETHMock;
  let depositToken: WStETHMock;

  let lZEndpointMockL1: LZEndpointMock;
  let lZEndpointMockL2: LZEndpointMock;

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

    [lZEndpointMockL1, lZEndpointMockL2, rewardToken, l1Sender, unwrappedToken, l2MessageReceiver, gatewayRouter] =
      await Promise.all([
        LZEndpointMock.deploy(senderChainId),
        LZEndpointMock.deploy(receiverChainId),
        Mor.deploy(wei(100)),
        L1Sender.deploy(),
        StETHMock.deploy(),
        L2MessageReceiver.deploy(),
        GatewayRouterMock.deploy(),
      ]);

    depositToken = await WStETHMock.deploy(unwrappedToken);

    await l1Sender.setDepositTokenConfig({
      token: depositToken,
      gateway: gatewayRouter,
      receiver: SECOND,
    });

    await l1Sender.setRewardTokenConfig({
      gateway: lZEndpointMockL1,
      receiver: l2MessageReceiver,
      receiverChainId: receiverChainId,
    });

    await lZEndpointMockL1.setDestLzEndpoint(l2MessageReceiver, lZEndpointMockL2);
    await l2MessageReceiver.setParams(rewardToken, {
      gateway: lZEndpointMockL2,
      sender: l1Sender,
      senderChainId: senderChainId,
    });

    await rewardToken.transferOwnership(l2MessageReceiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('setRewardTokenConfig', () => {
    it('check config', async () => {
      expect(await l1Sender.rewardTokenConfig()).to.be.deep.equal([
        await lZEndpointMockL1.getAddress(),
        await l2MessageReceiver.getAddress(),
        receiverChainId,
      ]);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).setRewardTokenConfig({
          gateway: lZEndpointMockL1,
          receiver: l2MessageReceiver,
          receiverChainId: receiverChainId,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setDepositTokenConfig', () => {
    it('check config', async () => {
      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await depositToken.getAddress(),
        await gatewayRouter.getAddress(),
        await SECOND.getAddress(),
      ]);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(ethers.MaxUint256);
      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(ethers.MaxUint256);
    });
    it('should reset allowances when token and gateway changed', async () => {
      const [WStETHMock, GatewayRouterMock, StETHMock] = await Promise.all([
        ethers.getContractFactory('WStETHMock'),
        ethers.getContractFactory('GatewayRouterMock'),
        ethers.getContractFactory('StETHMock'),
      ]);

      const newUnwrappedToken = await StETHMock.deploy();

      const [newDepositToken, newGatewayRouter] = await Promise.all([
        WStETHMock.deploy(newUnwrappedToken),
        GatewayRouterMock.deploy(),
      ]);

      const newConfig = {
        token: newDepositToken,
        gateway: newGatewayRouter,
        receiver: OWNER,
      };

      await l1Sender.setDepositTokenConfig(newConfig);

      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await newDepositToken.getAddress(),
        await newGatewayRouter.getAddress(),
        await OWNER.getAddress(),
      ]);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(0);
      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);

      expect(await newUnwrappedToken.allowance(l1Sender, newDepositToken)).to.be.equal(ethers.MaxUint256);
      expect(await newDepositToken.allowance(l1Sender, newGatewayRouter)).to.be.equal(ethers.MaxUint256);
    });
    it('should reset allowances when only token changed', async () => {
      const [WStETHMock, StETHMock] = await Promise.all([
        ethers.getContractFactory('WStETHMock'),
        ethers.getContractFactory('StETHMock'),
      ]);

      const newUnwrappedToken = await StETHMock.deploy();
      const [newDepositToken] = await Promise.all([WStETHMock.deploy(newUnwrappedToken)]);

      const newConfig = {
        token: newDepositToken,
        gateway: gatewayRouter,
        receiver: OWNER,
      };

      await l1Sender.setDepositTokenConfig(newConfig);

      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await newDepositToken.getAddress(),
        await gatewayRouter.getAddress(),
        await OWNER.getAddress(),
      ]);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(0);
      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);

      expect(await newUnwrappedToken.allowance(l1Sender, newDepositToken)).to.be.equal(ethers.MaxUint256);
    });
    it('should reset allowances when only gateway changed', async () => {
      const [GatewayRouterMock] = await Promise.all([ethers.getContractFactory('GatewayRouterMock')]);
      const [newGatewayRouter] = await Promise.all([GatewayRouterMock.deploy()]);

      const newConfig = {
        token: depositToken,
        gateway: newGatewayRouter,
        receiver: OWNER,
      };

      await l1Sender.setDepositTokenConfig(newConfig);

      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await depositToken.getAddress(),
        await newGatewayRouter.getAddress(),
        await OWNER.getAddress(),
      ]);

      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(ethers.MaxUint256);
      expect(await depositToken.allowance(l1Sender, newGatewayRouter)).to.be.equal(ethers.MaxUint256);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(OWNER).setDepositTokenConfig({
          token: depositToken,
          gateway: gatewayRouter,
          receiver: ZERO_ADDR,
        }),
      ).to.be.revertedWith('L1S: invalid receiver');
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).setDepositTokenConfig({
          token: depositToken,
          gateway: gatewayRouter,
          receiver: SECOND,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('sendDepositToken', () => {
    it('should send tokens to another address', async () => {
      const l1SenderAddress = await l1Sender.getAddress();
      await unwrappedToken.mint(l1SenderAddress, '100');

      await l1Sender.sendDepositToken(1, 1, 1);

      expect(await depositToken.balanceOf(SECOND)).to.eq('100');
    });
  });

  describe('sendMintMessage', () => {
    it('should send mint message', async () => {
      await l1Sender.sendMintMessage(SECOND, '999', OWNER, { value: ethers.parseEther('0.1') });
      expect(await rewardToken.balanceOf(SECOND)).to.eq('999');
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).sendMintMessage(SECOND, '999', OWNER, { value: ethers.parseEther('0.1') }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

// npx hardhat test "test/L1Sender.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/L1Sender.test.ts"

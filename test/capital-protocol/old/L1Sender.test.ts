import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  ArbitrumBridgeGatewayRouterMock,
  IL1Sender,
  L1Sender,
  L1SenderMock,
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

  let gatewayRouter: ArbitrumBridgeGatewayRouterMock;

  let l1Sender: L1Sender;
  let l2MessageReceiver: L2MessageReceiver;

  let rewardToken: MOR;
  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    const [
      ERC1967ProxyFactory,
      LZEndpointMock,
      Mor,
      L1Sender,
      GatewayRouterMock,
      StETHMock,
      WStETHMock,
      L2MessageReceiver,
    ] = await Promise.all([
      ethers.getContractFactory('ERC1967Proxy'),
      ethers.getContractFactory('LZEndpointMock'),
      ethers.getContractFactory('MOR'),
      ethers.getContractFactory('L1Sender'),
      ethers.getContractFactory('ArbitrumBridgeGatewayRouterMock'),
      ethers.getContractFactory('StETHMock'),
      ethers.getContractFactory('WStETHMock'),
      ethers.getContractFactory('L2MessageReceiver'),
    ]);

    let l1SenderImplementation: L1Sender;
    let l2MessageReceiverImplementation: L2MessageReceiver;

    [
      lZEndpointMockL1,
      lZEndpointMockL2,
      rewardToken,
      l1SenderImplementation,
      unwrappedToken,
      l2MessageReceiverImplementation,
      gatewayRouter,
    ] = await Promise.all([
      LZEndpointMock.deploy(senderChainId),
      LZEndpointMock.deploy(receiverChainId),
      Mor.deploy(wei(100)),
      L1Sender.deploy(),
      StETHMock.deploy(),
      L2MessageReceiver.deploy(),
      GatewayRouterMock.deploy(),
    ]);
    depositToken = await WStETHMock.deploy(unwrappedToken);

    const l2MessageReceiverProxy = await ERC1967ProxyFactory.deploy(l2MessageReceiverImplementation, '0x');
    l2MessageReceiver = L2MessageReceiver.attach(l2MessageReceiverProxy) as L2MessageReceiver;
    await l2MessageReceiver.L2MessageReceiver__init();

    const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
      gateway: lZEndpointMockL1,
      receiver: l2MessageReceiver,
      receiverChainId: receiverChainId,
      zroPaymentAddress: ZERO_ADDR,
      adapterParams: '0x',
    };
    const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
      token: depositToken,
      gateway: gatewayRouter,
      receiver: SECOND,
    };

    const l1SenderProxy = await ERC1967ProxyFactory.deploy(l1SenderImplementation, '0x');
    l1Sender = L1Sender.attach(l1SenderProxy) as L1Sender;
    await l1Sender.L1Sender__init(OWNER, rewardTokenConfig, depositTokenConfig);

    await l2MessageReceiver.setParams(rewardToken, {
      gateway: lZEndpointMockL2,
      sender: l1Sender,
      senderChainId: senderChainId,
    });

    await lZEndpointMockL1.setDestLzEndpoint(l2MessageReceiver, lZEndpointMockL2);

    await rewardToken.transferOwnership(l2MessageReceiver);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('UUPS proxy functionality', () => {
    let rewardTokenConfig: IL1Sender.RewardTokenConfigStruct;
    let depositTokenConfig: IL1Sender.DepositTokenConfigStruct;

    before(async () => {
      rewardTokenConfig = {
        gateway: lZEndpointMockL1,
        receiver: l2MessageReceiver,
        receiverChainId: receiverChainId,
        zroPaymentAddress: ZERO_ADDR,
        adapterParams: '0x',
      };
      depositTokenConfig = {
        token: depositToken,
        gateway: gatewayRouter,
        receiver: SECOND,
      };
    });

    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        const l1Sender = await (await ethers.getContractFactory('L1Sender')).deploy();

        await expect(l1Sender.L1Sender__init(OWNER, rewardTokenConfig, depositTokenConfig)).to.be.rejectedWith(reason);
      });
    });

    describe('#L1Sender__init', () => {
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(l1Sender.L1Sender__init(OWNER, rewardTokenConfig, depositTokenConfig)).to.be.rejectedWith(reason);
      });
      it('should setup config', async () => {
        expect(await l1Sender.distribution()).to.be.equal(OWNER.address);

        expect(await l1Sender.rewardTokenConfig()).to.be.deep.equal([
          await lZEndpointMockL1.getAddress(),
          await l2MessageReceiver.getAddress(),
          receiverChainId,
          ZERO_ADDR,
          '0x',
        ]);

        expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
          await depositToken.getAddress(),
          await gatewayRouter.getAddress(),
          SECOND.address,
        ]);

        expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(ethers.MaxUint256);
        expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(ethers.MaxUint256);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const l1SenderV2Factory = await ethers.getContractFactory('L1SenderMock');
        const l1SenderV2Implementation = await l1SenderV2Factory.deploy();

        await l1Sender.upgradeTo(l1SenderV2Implementation);

        const l1SenderV2 = l1SenderV2Factory.attach(l1Sender) as L1SenderMock;

        expect(await l1SenderV2.version()).to.eq(666);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(l1Sender.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IL1Sender', async () => {
      expect(await l1Sender.supportsInterface('0x0d3ba6cb')).to.be.true;
    });
    it('should support IERC165', async () => {
      expect(await l1Sender.supportsInterface('0x01ffc9a7')).to.be.true;
    });
  });

  describe('setDistribution', () => {
    it('should set distribution', async () => {
      await l1Sender.setDistribution(SECOND);
      expect(await l1Sender.distribution()).to.be.equal(SECOND.address);
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(SECOND).setDistribution(SECOND)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('setRewardTokenConfig', () => {
    it('should set new config', async () => {
      const newConfig = {
        gateway: l2MessageReceiver,
        receiver: lZEndpointMockL1,
        receiverChainId: 0,
        zroPaymentAddress: ZERO_ADDR,
        adapterParams: '0x',
      };

      await l1Sender.setRewardTokenConfig(newConfig);

      expect(await l1Sender.rewardTokenConfig()).to.be.deep.equal([
        await l2MessageReceiver.getAddress(),
        await lZEndpointMockL1.getAddress(),
        0,
        ZERO_ADDR,
        '0x',
      ]);
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(SECOND).setRewardTokenConfig({
          gateway: lZEndpointMockL1,
          receiver: l2MessageReceiver,
          receiverChainId: receiverChainId,
          zroPaymentAddress: ZERO_ADDR,
          adapterParams: '0x',
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setDepositTokenConfig', () => {
    it('should reset allowances when token and gateway changed', async () => {
      const [WStETHMock, GatewayRouterMock, StETHMock] = await Promise.all([
        ethers.getContractFactory('WStETHMock'),
        ethers.getContractFactory('ArbitrumBridgeGatewayRouterMock'),
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
        OWNER.address,
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
        OWNER.address,
      ]);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(0);
      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);

      expect(await newUnwrappedToken.allowance(l1Sender, newDepositToken)).to.be.equal(ethers.MaxUint256);
    });
    it('should reset allowances when only gateway changed', async () => {
      const [GatewayRouterMock] = await Promise.all([ethers.getContractFactory('ArbitrumBridgeGatewayRouterMock')]);
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
        OWNER.address,
      ]);

      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(0);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(ethers.MaxUint256);
      expect(await depositToken.allowance(l1Sender, newGatewayRouter)).to.be.equal(ethers.MaxUint256);
    });
    it('should not change allowances when only receiver changed', async () => {
      const newConfig = {
        token: depositToken,
        gateway: gatewayRouter,
        receiver: SECOND,
      };

      await l1Sender.setDepositTokenConfig(newConfig);

      expect(await l1Sender.depositTokenConfig()).to.be.deep.equal([
        await depositToken.getAddress(),
        await gatewayRouter.getAddress(),
        SECOND.address,
      ]);

      expect(await unwrappedToken.allowance(l1Sender, depositToken)).to.be.equal(ethers.MaxUint256);
      expect(await depositToken.allowance(l1Sender, gatewayRouter)).to.be.equal(ethers.MaxUint256);
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
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(SECOND).sendDepositToken(1, 1, 1)).to.be.revertedWith('L1S: invalid sender');
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
      ).to.be.revertedWith('L1S: invalid sender');
    });
    it('should not revert if not L2MessageReceiver sender', async () => {
      await l2MessageReceiver.setParams(rewardToken, {
        gateway: lZEndpointMockL2,
        sender: OWNER,
        senderChainId: senderChainId,
      });

      await l1Sender.sendMintMessage(SECOND, '999', OWNER, { value: ethers.parseEther('0.1') });
      expect(await rewardToken.balanceOf(SECOND)).to.eq(0);
    });
    it('should `retryMessage` for failed message on the `L2MessageReceiver`', async () => {
      const amount = '998';

      // START send invalid call to L2MessageReceiver
      // Set invalid sender in config
      await l2MessageReceiver.setParams(rewardToken, {
        gateway: lZEndpointMockL2,
        sender: ZERO_ADDR,
        senderChainId: senderChainId,
      });

      await l1Sender.sendMintMessage(SECOND, amount, OWNER, { value: ethers.parseEther('0.1') });
      expect(await rewardToken.balanceOf(SECOND)).to.eq('0');
      // END

      // Set valid sender in config
      await l2MessageReceiver.setParams(rewardToken, {
        gateway: lZEndpointMockL2,
        sender: l1Sender,
        senderChainId: senderChainId,
      });

      // Must send messages even though the previous one may be blocked
      await l1Sender.sendMintMessage(SECOND, '1', OWNER, { value: ethers.parseEther('0.1') });
      expect(await rewardToken.balanceOf(SECOND)).to.eq('1');

      // START retry to send invalid message
      const senderAndReceiverAddress = ethers.solidityPacked(
        ['address', 'address'],
        [await l1Sender.getAddress(), await l2MessageReceiver.getAddress()],
      );
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [SECOND.address, amount]);

      await l2MessageReceiver.retryMessage(senderChainId, senderAndReceiverAddress, 1, payload);
      expect(await rewardToken.balanceOf(SECOND)).to.eq(Number(amount) + 1);
      // END

      // Next messages shouldn't fail
      await l1Sender.sendMintMessage(SECOND, '1', OWNER, { value: ethers.parseEther('0.1') });
      expect(await rewardToken.balanceOf(SECOND)).to.eq(Number(amount) + 2);
    });
  });
});

// npx hardhat test "test/L1Sender.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/L1Sender.test.ts"

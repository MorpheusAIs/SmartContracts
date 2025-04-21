import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  deployArbitrumBridgeGatewayRouterMock,
  deployDistributorMock,
  deployERC20Token,
  deployInterfaceMock,
  deployL1SenderV2,
  deployL2MessageReceiver,
  deployLZEndpointMock,
  deployRewardPoolMock,
  deployStETHMock,
  deployUniswapSwapRouterMock,
  deployWstETHMock,
} from '../helpers/deployers';

import {
  ArbitrumBridgeGatewayRouterMock,
  DistributorMock,
  L1SenderV2,
  StETHMock,
  UniswapSwapRouterMock,
  WStETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('L1SenderV2', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;

  let stETH: StETHMock;
  let wstETH: WStETHMock;
  let l1Sender: L1SenderV2;
  let distributor: DistributorMock;
  let arbitrumBridgeGatewayRouterMock: ArbitrumBridgeGatewayRouterMock;
  let uniswapSwapRouterMock: UniswapSwapRouterMock;

  before(async () => {
    [OWNER, BOB] = await ethers.getSigners();

    stETH = await deployStETHMock();
    wstETH = await deployWstETHMock(stETH);
    distributor = await deployDistributorMock(await deployRewardPoolMock(), await deployERC20Token());
    arbitrumBridgeGatewayRouterMock = await deployArbitrumBridgeGatewayRouterMock();
    uniswapSwapRouterMock = await deployUniswapSwapRouterMock();
    l1Sender = await deployL1SenderV2();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(l1Sender.connect(OWNER).L1SenderV2__init()).to.be.revertedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should upgrade to the new version', async () => {
        const [factory] = await Promise.all([ethers.getContractFactory('L1SenderMock')]);
        const contract = await factory.deploy();

        await l1Sender.upgradeTo(contract);
        expect(await l1Sender.version()).to.eq(666);
      });

      it('should revert if caller is not the owner', async () => {
        await expect(l1Sender.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('#version()', () => {
      it('should return correct version', async () => {
        expect(await l1Sender.version()).to.eq(2);
      });
    });
  });

  describe('#supportsInterface', () => {
    it('should support IL1SenderV2', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await l1Sender.supportsInterface(await interfaceMock.getIL1SenderV2InterfaceId())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await l1Sender.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setStETh', () => {
    it('should correctly set new value', async () => {
      await l1Sender.setStETh(stETH);
      expect(await l1Sender.stETH()).to.be.equal(stETH);
    });
    it('should revert when invalid distributor address', async () => {
      await expect(l1Sender.setStETh(ZERO_ADDR)).to.be.revertedWith('L1S: invalid stETH address');
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setStETh(stETH)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setDistribution', () => {
    it('should correctly set new value', async () => {
      await l1Sender.setDistributor(distributor);
      expect(await l1Sender.distributor()).to.be.equal(distributor);
    });
    it('should revert when invalid distributor address', async () => {
      await expect(l1Sender.setDistributor(await deployRewardPoolMock())).to.be.revertedWith(
        'L1S: invalid distributor address',
      );
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setDistributor(distributor)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setUniswapSwapRouter', () => {
    it('should correctly set new value', async () => {
      await l1Sender.setUniswapSwapRouter(uniswapSwapRouterMock);
      expect(await l1Sender.uniswapSwapRouter()).to.be.equal(uniswapSwapRouterMock);
    });
    it('should revert when invalid `uniswapSwapRouter` address', async () => {
      await expect(l1Sender.setUniswapSwapRouter(ZERO_ADDR)).to.be.revertedWith(
        'L1S: invalid `uniswapSwapRouter` address',
      );
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setUniswapSwapRouter(uniswapSwapRouterMock)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setLayerZeroConfig', () => {
    const config = {
      gateway: '',
      receiver: '',
      receiverChainId: 0,
      zroPaymentAddress: ZERO_ADDR,
      adapterParams: '0x',
    };
    beforeEach(async () => {
      config.gateway = await BOB.getAddress();
      config.receiver = await OWNER.getAddress();
    });

    it('should set new config', async () => {
      await l1Sender.setLayerZeroConfig(config);

      expect(await l1Sender.layerZeroConfig()).to.be.deep.equal([config.gateway, config.receiver, 0, ZERO_ADDR, '0x']);
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setLayerZeroConfig(config)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setArbitrumBridgeConfig', () => {
    it('should correctly set new config', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };

      await l1Sender.setArbitrumBridgeConfig(config);

      expect(await l1Sender.arbitrumBridgeConfig()).to.be.deep.equal([
        await wstETH.getAddress(),
        await arbitrumBridgeGatewayRouterMock.getAddress(),
        await BOB.getAddress(),
      ]);

      expect(await stETH.allowance(l1Sender, wstETH)).to.be.equal(ethers.MaxUint256);
      expect(await wstETH.allowance(l1Sender, arbitrumBridgeGatewayRouterMock)).to.be.equal(ethers.MaxUint256);
    });
    it('should correctly reset new config', async () => {
      await l1Sender.setStETh(stETH);

      const config1 = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config1);

      const config2 = { ...config1 };
      config2.wstETH = await deployWstETHMock(await deployStETHMock());
      config2.gateway = await deployArbitrumBridgeGatewayRouterMock();
      config2.receiver = OWNER;
      await l1Sender.setArbitrumBridgeConfig(config2);

      expect(await l1Sender.arbitrumBridgeConfig()).to.be.deep.equal([
        await config2.wstETH.getAddress(),
        await config2.gateway.getAddress(),
        await config2.receiver.getAddress(),
      ]);

      expect(await stETH.allowance(l1Sender, wstETH)).to.be.equal(0);
      expect(await wstETH.allowance(l1Sender, arbitrumBridgeGatewayRouterMock)).to.be.equal(0);

      expect(await stETH.allowance(l1Sender, config2.wstETH)).to.be.equal(ethers.MaxUint256);
      expect(await config2.wstETH.allowance(l1Sender, config2.gateway)).to.be.equal(ethers.MaxUint256);
    });
    it('should revert when stETH is not set', async () => {
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: ZERO_ADDR,
      };

      await expect(l1Sender.setArbitrumBridgeConfig(config)).to.be.revertedWith('L1S: stETH is not set');
    });
    it('should revert when invalid receiver', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: ZERO_ADDR,
      };

      await expect(l1Sender.setArbitrumBridgeConfig(config)).to.be.revertedWith('L1S: invalid receiver');
    });
    it('should revert if not called by the owner', async () => {
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };

      await expect(l1Sender.connect(BOB).setArbitrumBridgeConfig(config)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#sendWstETH', () => {
    beforeEach(async () => {
      await l1Sender.setStETh(stETH);
    });

    it('should send stETH tokens to another address', async () => {
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config);

      await stETH.mint(l1Sender, wei(100));

      await l1Sender.sendWstETH(1, 1, 1);

      expect(await stETH.balanceOf(l1Sender)).to.eq(0);
      expect(await wstETH.balanceOf(BOB)).to.eq(wei(100));
    });
    it('should send wstETH tokens to another address', async () => {
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config);

      await wstETH.mint(l1Sender, wei(100));

      await l1Sender.sendWstETH(1, 1, 1);

      expect(await stETH.balanceOf(l1Sender)).to.eq(0);
      expect(await wstETH.balanceOf(BOB)).to.eq(wei(100));
    });
    it("should revert when wstETH isn't set", async () => {
      await expect(l1Sender.sendWstETH(1, 1, 1)).to.be.revertedWith("L1S: wstETH isn't set");
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).sendWstETH(1, 1, 1)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#sendMintMessage', () => {
    it('should send mint message', async () => {
      const lzEndpointMockL1 = await deployLZEndpointMock(101);
      const lzEndpointMockL2 = await deployLZEndpointMock(110);
      const l2MessageReceiver = await deployL2MessageReceiver();

      const mor = await deployERC20Token();
      await l2MessageReceiver.setParams(mor, {
        gateway: lzEndpointMockL2,
        sender: l1Sender,
        senderChainId: 101,
      });

      await lzEndpointMockL1.setDestLzEndpoint(l2MessageReceiver, lzEndpointMockL2);

      await l1Sender.setLayerZeroConfig({
        gateway: lzEndpointMockL1,
        receiver: l2MessageReceiver,
        receiverChainId: 110,
        zroPaymentAddress: ZERO_ADDR,
        adapterParams: '0x',
      });

      const distributorMock = await deployDistributorMock(await deployRewardPoolMock(), await deployERC20Token());

      await l1Sender.setDistributor(distributorMock);
      await distributorMock.sendMintMessageToL1Sender(l1Sender, BOB, wei(1), OWNER, {
        value: ethers.parseEther('20'),
      });
      expect(await mor.balanceOf(BOB)).to.eq(wei(1));
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.sendMintMessage(BOB, '999', OWNER, { value: ethers.parseEther('0.1') })).to.be.revertedWith(
        "L1S: the `msg.sender` isn't `distributor`",
      );
    });
  });

  describe('#swapExactInputMultihop', () => {
    it('should swap tokens', async () => {
      const tokenIn = await deployERC20Token();

      await tokenIn.mint(l1Sender, wei(90));
      await wstETH.mint(uniswapSwapRouterMock, wei(90));

      await l1Sender.setStETh(stETH);
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config);

      await l1Sender.setUniswapSwapRouter(uniswapSwapRouterMock);
      await l1Sender.swapExactInputMultihop([tokenIn, wstETH], [100], wei(90), wei(40), 0);

      expect(await tokenIn.balanceOf(l1Sender)).to.eq(wei(0));
      expect(await wstETH.balanceOf(l1Sender)).to.eq(wei(90));
    });
    it('should revert when invalid `amountIn_` value', async () => {
      await l1Sender.setStETh(stETH);
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config);

      await expect(l1Sender.swapExactInputMultihop([stETH, wstETH], [100], wei(0), wei(40), 0)).to.be.revertedWith(
        'L1S: invalid `amountIn_` value',
      );
    });
    it('should revert when invalid `amountIn_` value', async () => {
      await l1Sender.setStETh(stETH);
      const config = {
        wstETH: wstETH,
        gateway: arbitrumBridgeGatewayRouterMock,
        receiver: BOB,
      };
      await l1Sender.setArbitrumBridgeConfig(config);

      await expect(l1Sender.swapExactInputMultihop([stETH, wstETH], [100], wei(10), wei(0), 0)).to.be.revertedWith(
        'L1S: invalid `amountOutMinimum_` value',
      );
    });
    it('should revert when invalid array length', async () => {
      await expect(l1Sender.swapExactInputMultihop([stETH], [100], wei(10), wei(0), 0)).to.be.revertedWith(
        'L1S: invalid array length',
      );

      await expect(l1Sender.swapExactInputMultihop([stETH, wstETH], [100, 100], wei(10), wei(0), 0)).to.be.revertedWith(
        'L1S: invalid array length',
      );
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender.connect(BOB).swapExactInputMultihop([stETH, wstETH], [100], wei(90), wei(40), 0),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

// npx hardhat test "test/capital-protocol/L1SenderV2.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/L1SenderV2.test.ts"

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  deployArbitrumBridgeGatewayRouterMock,
  deployDistributorV3Mock,
  deployERC20Token,
  deployInterfaceMock,
  deployL1SenderV3,
  deployL2MessageReceiverV2,
  deployLayerZeroEndpointV2Mock,
  deployLidoL1ERC20TokenBridgeMock,
  deployMOROFT,
  deployRewardPoolMock,
  deploySimpleMessageLib,
  deployStETHMock,
  deployUniswapSwapRouterMock,
  deployWstETHMock,
} from '../helpers/deployers';

import {
  ArbitrumBridgeGatewayRouterMock,
  DistributorV3Mock,
  L1SenderV3,
  LidoL1ERC20TokenBridgeMock,
  StETHMock,
  UniswapSwapRouterMock,
  WStETHMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('L1SenderV3', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;

  let stETH: StETHMock;
  let wstETH: WStETHMock;
  let l1Sender: L1SenderV3;
  let distributor: DistributorV3Mock;
  let arbitrumBridgeGatewayRouterMock: ArbitrumBridgeGatewayRouterMock;
  let lidoL1ERC20TokenBridgeMock: LidoL1ERC20TokenBridgeMock;
  let uniswapSwapRouterMock: UniswapSwapRouterMock;

  before(async () => {
    [OWNER, BOB] = await ethers.getSigners();

    stETH = await deployStETHMock();
    wstETH = await deployWstETHMock(stETH);
    distributor = await deployDistributorV3Mock(await deployRewardPoolMock(), await deployERC20Token());
    arbitrumBridgeGatewayRouterMock = await deployArbitrumBridgeGatewayRouterMock();
    lidoL1ERC20TokenBridgeMock = await deployLidoL1ERC20TokenBridgeMock();
    uniswapSwapRouterMock = await deployUniswapSwapRouterMock();
    l1Sender = await deployL1SenderV3();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(l1Sender.connect(OWNER).L1SenderV3__init()).to.be.revertedWith(reason);
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
        expect(await l1Sender.version()).to.eq(3);
      });
    });
  });

  describe('#supportsInterface', () => {
    it('should support IL1SenderV3', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await l1Sender.supportsInterface(await interfaceMock.getIL1SenderV3InterfaceId())).to.be.true;
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

  // `setLayerZeroConfig` was retired on `L1SenderV3` (LayerZero V1 -> V2 migration); the storage
  // slot lives on as `unusedStorage0`, no setter remains. See `setLzEndpointV2`/`setLzV2Config` below.

  describe('#setLzEndpointV2', () => {
    it('should correctly set new value', async () => {
      const newEndpoint = await deployLayerZeroEndpointV2Mock(1, await OWNER.getAddress());

      await l1Sender.setLzEndpointV2(newEndpoint);

      expect(await l1Sender.lzEndpointV2()).to.eq(await newEndpoint.getAddress());
    });
    it('should revert when zero address', async () => {
      await expect(l1Sender.setLzEndpointV2(ZERO_ADDR)).to.be.revertedWith('L1S: invalid `lzEndpointV2` address');
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setLzEndpointV2(OWNER)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setLzDelegate', () => {
    it('should correctly set the delegate on the endpoint', async () => {
      const endpoint = await deployLayerZeroEndpointV2Mock(1, await OWNER.getAddress());
      await l1Sender.setLzEndpointV2(endpoint);

      await l1Sender.setLzDelegate(BOB);

      expect(await endpoint.delegates(l1Sender)).to.eq(await BOB.getAddress());
    });
    it("should revert when lzEndpointV2 isn't set", async () => {
      await expect(l1Sender.setLzDelegate(BOB)).to.be.revertedWith('L1S: lzEndpointV2 not set');
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setLzDelegate(BOB)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setDefaultChainId', () => {
    // `chainId_` (the key) is the real EVM chain id; `eid` inside the config is the separate
    // LayerZero endpoint id it resolves to. Arbitrum's real values, to keep the two distinct.
    const arbitrumChainId = 42161;
    const config = {
      eid: 30110,
      receiver: ethers.zeroPadValue('0x000000000000000000000000000000000000dEaD', 32),
      options: '0x1234',
    };

    it('should correctly set new value', async () => {
      await l1Sender.setLzV2Config(arbitrumChainId, config);
      await l1Sender.setDefaultChainId(arbitrumChainId);

      expect(await l1Sender.defaultChainId()).to.eq(arbitrumChainId);
    });
    it("should revert when there's no LZ V2 config for `chainId_`", async () => {
      await expect(l1Sender.setDefaultChainId(arbitrumChainId)).to.be.revertedWith(
        'L1S: no LZ V2 config for `chainId_`',
      );
    });
    it('should revert when trying to reset to zero', async () => {
      await l1Sender.setLzV2Config(arbitrumChainId, config);
      await l1Sender.setDefaultChainId(arbitrumChainId);

      await expect(l1Sender.setDefaultChainId(0)).to.be.revertedWith('L1S: no LZ V2 config for `chainId_`');
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setDefaultChainId(arbitrumChainId)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setLzV2Config', () => {
    const arbitrumChainId = 42161;
    const baseChainId = 8453;
    const config = {
      eid: 30110,
      receiver: ethers.zeroPadValue('0x000000000000000000000000000000000000dEaD', 32),
      options: '0x1234',
    };

    it('should correctly set new value', async () => {
      await l1Sender.setLzV2Config(arbitrumChainId, config);

      const stored = await l1Sender.lzV2Configs(arbitrumChainId);
      expect(stored.eid).to.eq(config.eid);
      expect(stored.receiver).to.eq(config.receiver);
      expect(stored.options).to.eq(config.options);
    });
    it('should correctly set different configs per chain id', async () => {
      const configBase = {
        eid: 30184,
        receiver: ethers.zeroPadValue('0x000000000000000000000000000000000000bEEF', 32),
        options: '0x1234',
      };

      await l1Sender.setLzV2Config(arbitrumChainId, config);
      await l1Sender.setLzV2Config(baseChainId, configBase);

      expect((await l1Sender.lzV2Configs(arbitrumChainId)).eid).to.eq(config.eid);
      expect((await l1Sender.lzV2Configs(arbitrumChainId)).receiver).to.eq(config.receiver);
      expect((await l1Sender.lzV2Configs(baseChainId)).eid).to.eq(configBase.eid);
      expect((await l1Sender.lzV2Configs(baseChainId)).receiver).to.eq(configBase.receiver);
      expect((await l1Sender.lzV2Configs(baseChainId)).options).to.eq(configBase.options);
    });
    it('should revert when chainId_ is zero', async () => {
      await expect(l1Sender.setLzV2Config(0, config)).to.be.revertedWith('L1S: invalid `chainId_`');
    });
    it('should revert when eid is zero', async () => {
      await expect(l1Sender.setLzV2Config(arbitrumChainId, { ...config, eid: 0 })).to.be.revertedWith(
        'L1S: invalid eid',
      );
    });
    it('should revert when receiver is zero bytes32', async () => {
      await expect(
        l1Sender.setLzV2Config(arbitrumChainId, { ...config, receiver: ethers.ZeroHash }),
      ).to.be.revertedWith('L1S: invalid receiver');
    });
    it('should revert when options is empty', async () => {
      await expect(l1Sender.setLzV2Config(arbitrumChainId, { ...config, options: '0x' })).to.be.revertedWith(
        'L1S: empty options',
      );
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).setLzV2Config(arbitrumChainId, config)).to.be.revertedWith(
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

  describe('#setBaseBridgeConfig', () => {
    it('should correctly set new config', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };

      await l1Sender.setBaseBridgeConfig(config);

      expect(await l1Sender.baseBridgeConfig()).to.be.deep.equal([
        await wstETH.getAddress(),
        await OWNER.getAddress(),
        await lidoL1ERC20TokenBridgeMock.getAddress(),
        await BOB.getAddress(),
      ]);

      expect(await stETH.allowance(l1Sender, wstETH)).to.be.equal(ethers.MaxUint256);
      expect(await wstETH.allowance(l1Sender, lidoL1ERC20TokenBridgeMock)).to.be.equal(ethers.MaxUint256);
    });
    it('should correctly reset new config', async () => {
      await l1Sender.setStETh(stETH);

      const config1 = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };
      await l1Sender.setBaseBridgeConfig(config1);

      const config2 = { ...config1 };
      config2.wstETH = await deployWstETHMock(await deployStETHMock());
      config2.bridge = await deployLidoL1ERC20TokenBridgeMock();
      config2.receiver = OWNER;
      await l1Sender.setBaseBridgeConfig(config2);

      expect(await l1Sender.baseBridgeConfig()).to.be.deep.equal([
        await config2.wstETH.getAddress(),
        await config2.remoteWstETH.getAddress(),
        await config2.bridge.getAddress(),
        await config2.receiver.getAddress(),
      ]);

      expect(await stETH.allowance(l1Sender, wstETH)).to.be.equal(0);
      expect(await wstETH.allowance(l1Sender, lidoL1ERC20TokenBridgeMock)).to.be.equal(0);

      expect(await stETH.allowance(l1Sender, config2.wstETH)).to.be.equal(ethers.MaxUint256);
      expect(await config2.wstETH.allowance(l1Sender, config2.bridge)).to.be.equal(ethers.MaxUint256);
    });
    it('should revert when stETH is not set', async () => {
      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: ZERO_ADDR,
      };

      await expect(l1Sender.setBaseBridgeConfig(config)).to.be.revertedWith('L1S: stETH is not set');
    });
    it('should revert when invalid wstETH', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: ZERO_ADDR,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };

      await expect(l1Sender.setBaseBridgeConfig(config)).to.be.revertedWith('L1S: invalid wstETH');
    });
    it('should revert when invalid remoteWstETH', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        remoteWstETH: ZERO_ADDR,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };

      await expect(l1Sender.setBaseBridgeConfig(config)).to.be.revertedWith('L1S: invalid remoteWstETH');
    });
    it('should revert when invalid bridge', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: ZERO_ADDR,
        receiver: BOB,
      };

      await expect(l1Sender.setBaseBridgeConfig(config)).to.be.revertedWith('L1S: invalid bridge');
    });
    it('should revert when invalid receiver', async () => {
      await l1Sender.setStETh(stETH);

      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: ZERO_ADDR,
      };

      await expect(l1Sender.setBaseBridgeConfig(config)).to.be.revertedWith('L1S: invalid receiver');
    });
    it('should revert if not called by the owner', async () => {
      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };

      await expect(l1Sender.connect(BOB).setBaseBridgeConfig(config)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#sendWstETHToBase', () => {
    beforeEach(async () => {
      await l1Sender.setStETh(stETH);
    });

    it('should send stETH tokens to another address', async () => {
      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };
      await l1Sender.setBaseBridgeConfig(config);

      await stETH.mint(l1Sender, wei(100));

      await l1Sender.sendWstETHToBase(1, '0x');

      expect(await stETH.balanceOf(l1Sender)).to.eq(0);
      expect(await wstETH.balanceOf(BOB)).to.eq(wei(100));
    });
    it('should send wstETH tokens to another address', async () => {
      const config = {
        wstETH: wstETH,
        remoteWstETH: OWNER,
        bridge: lidoL1ERC20TokenBridgeMock,
        receiver: BOB,
      };
      await l1Sender.setBaseBridgeConfig(config);

      await wstETH.mint(l1Sender, wei(100));

      await l1Sender.sendWstETHToBase(1, '0x');

      expect(await stETH.balanceOf(l1Sender)).to.eq(0);
      expect(await wstETH.balanceOf(BOB)).to.eq(wei(100));
    });
    it("should revert when wstETH isn't set", async () => {
      await expect(l1Sender.sendWstETHToBase(1, '0x')).to.be.revertedWith("L1S: wstETH isn't set");
    });
    it('should revert if not called by the owner', async () => {
      await expect(l1Sender.connect(BOB).sendWstETHToBase(1, '0x')).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#sendMintMessage', () => {
    // LayerZero V2 doesn't auto-deliver like the old V1 mock (`setDestLzEndpoint`) did. Delivery is
    // simulated in three real steps against real `LayerZeroEndpointV2Mock` instances, exactly like a
    // relayer + executor would: (1) l1Sender sends through the L1 endpoint, (2) the registered receive
    // library on the L2 endpoint verifies the message, (3) the L2 endpoint executes `lzReceive` on the
    // real `L2MessageReceiverV2`, which mints via the real `MOROFT`.
    const l1Eid = 1;
    const l2Eid = 2;

    it('should send mint message', async () => {
      const l1Endpoint = await deployLayerZeroEndpointV2Mock(l1Eid, await OWNER.getAddress());
      const l2Endpoint = await deployLayerZeroEndpointV2Mock(l2Eid, await OWNER.getAddress());

      const sendLib = await deploySimpleMessageLib(await l1Endpoint.getAddress(), await OWNER.getAddress());
      const receiveLib = await deploySimpleMessageLib(await l2Endpoint.getAddress(), await OWNER.getAddress());

      await l1Endpoint.connect(OWNER).registerLibrary(sendLib);
      await l1Endpoint.connect(OWNER).setDefaultSendLibrary(l2Eid, sendLib);

      await l2Endpoint.connect(OWNER).registerLibrary(receiveLib);
      await l2Endpoint.connect(OWNER).setDefaultReceiveLibrary(l1Eid, receiveLib, 0);

      // MOROFT is deployed with a placeholder minter, then the real minter (the receiver below) is
      // granted rights once its address is known.
      const mor = await deployMOROFT(l2Eid, OWNER, OWNER, OWNER);

      const l2MessageReceiver = await deployL2MessageReceiverV2(
        await l2Endpoint.getAddress(),
        await OWNER.getAddress(),
        await mor.getAddress(),
      );
      await mor.connect(OWNER).updateMinter(l2MessageReceiver, true);

      const l1SenderAddress = ethers.zeroPadValue(await l1Sender.getAddress(), 32);
      const l2ReceiverAddress = ethers.zeroPadValue(await l2MessageReceiver.getAddress(), 32);

      await l2MessageReceiver.connect(OWNER).setPeer(l1Eid, l1SenderAddress);

      await l1Sender.setLzEndpointV2(l1Endpoint);
      await l1Sender.setLzV2Config(l2Eid, { eid: l2Eid, receiver: l2ReceiverAddress, options: '0x1234' });
      await l1Sender.setDefaultChainId(l2Eid);

      const distributorMock = await deployDistributorV3Mock(await deployRewardPoolMock(), await deployERC20Token());
      await l1Sender.setDistributor(distributorMock);

      // (1) Send from L1.
      await distributorMock.sendMintMessageToL1Sender(l1Sender, BOB, wei(1), OWNER, {
        value: ethers.parseEther('20'),
      });

      // (2) Verify on L2, as the registered receive library would.
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [await BOB.getAddress(), wei(1)],
      );
      const guid = ethers.id('L1SenderV3.test.ts sendMintMessage guid');
      const origin = { srcEid: l1Eid, sender: l1SenderAddress, nonce: 1 };
      const payloadHash = ethers.keccak256(ethers.concat([guid, message]));

      const receiveLibAddress = await receiveLib.getAddress();
      await ethers.provider.send('hardhat_impersonateAccount', [receiveLibAddress]);
      await ethers.provider.send('hardhat_setBalance', [receiveLibAddress, ethers.toBeHex(wei(1))]);
      const receiveLibSigner = await ethers.getSigner(receiveLibAddress);

      await l2Endpoint.connect(receiveLibSigner).verify(origin, l2MessageReceiver, payloadHash);

      // (3) Execute on L2, as the executor would.
      await l2Endpoint.connect(OWNER).lzReceive(origin, l2MessageReceiver, guid, message, '0x');

      expect(await mor.balanceOf(BOB)).to.eq(wei(1));
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        l1Sender['sendMintMessage(address,uint256,address)'](BOB, '999', OWNER, { value: ethers.parseEther('0.1') }),
      ).to.be.revertedWith("L1S: the `msg.sender` isn't `distributor`");
    });
    it("should revert when lzEndpointV2 isn't set", async () => {
      const distributorMock = await deployDistributorV3Mock(await deployRewardPoolMock(), await deployERC20Token());
      await l1Sender.setDistributor(distributorMock);

      await expect(
        distributorMock.sendMintMessageToL1Sender(l1Sender, BOB, wei(1), OWNER, { value: wei(1) }),
      ).to.be.revertedWith('L1S: lzEndpointV2 not set');
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

// npx hardhat test "test/capital-protocol/L1SenderV3.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/L1SenderV3.test.ts"

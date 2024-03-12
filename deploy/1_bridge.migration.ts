import { Deployer, Reporter, UserStorage } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import {
  ERC1967Proxy__factory,
  L2MessageReceiver__factory,
  L2TokenReceiver__factory,
  MOR__factory,
} from '@/generated-types/ethers';
import { IL2TokenReceiver } from '@/generated-types/ethers/contracts/L2TokenReceiver';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig(await deployer.getChainId());

  let WStETH: string;
  let swapRouter: string;
  let nonfungiblePositionManager: string;

  if (config.L2) {
    WStETH = config.L2.wStEth;
    swapRouter = config.L2.swapRouter;
    nonfungiblePositionManager = config.L2.nonfungiblePositionManager;
  } else {
    // deploy mock
    // const stETHMock = await deployer.deploy(StETHMock__factory, [], { name: 'StETH on L2' });
    // const stETH = await stETHMock.getAddress();

    // const wStEthMock = await deployer.deploy(WStETHMock__factory, [stETH], { name: 'Wrapped stETH on L2' });
    // WStETH = await wStEthMock.getAddress();

    // const swapRouterMock = await deployer.deploy(SwapRouterMock__factory);
    // swapRouter = await swapRouterMock.getAddress();

    // const nonfungiblePositionManagerMock = await deployer.deploy(NonfungiblePositionManagerMock__factory);
    // nonfungiblePositionManager = await nonfungiblePositionManagerMock.getAddress();
    return;
  }

  const MOR = await deployer.deploy(MOR__factory, [config.cap]);
  UserStorage.set('MOR', await MOR.getAddress());

  const swapParams: IL2TokenReceiver.SwapParamsStruct = {
    tokenIn: WStETH,
    tokenOut: MOR,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };

  const l2TokenReceiverImpl = await deployer.deploy(L2TokenReceiver__factory);
  const l2TokenReceiverProxy = await deployer.deploy(ERC1967Proxy__factory, [l2TokenReceiverImpl, '0x'], {
    name: 'L2TokenReceiver Proxy',
  });
  UserStorage.set('L2TokenReceiver Proxy', await l2TokenReceiverProxy.getAddress());
  const l2TokenReceiver = L2TokenReceiver__factory.connect(
    await l2TokenReceiverProxy.getAddress(),
    await deployer.getSigner(),
  );
  await l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, swapParams);

  const l2MessageReceiverImpl = await deployer.deploy(L2MessageReceiver__factory);
  const l2MessageReceiverProxy = await deployer.deploy(ERC1967Proxy__factory, [l2MessageReceiverImpl, '0x'], {
    name: 'L2MessageReceiver Proxy',
  });
  UserStorage.set('L2MessageReceiver Proxy', await l2MessageReceiverProxy.getAddress());
  const l2MessageReceiver = L2MessageReceiver__factory.connect(
    await l2MessageReceiverProxy.getAddress(),
    await deployer.getSigner(),
  );
  await l2MessageReceiver.L2MessageReceiver__init();

  await MOR.transferOwnership(l2MessageReceiver);

  Reporter.reportContracts(
    ['L2TokenReceiver', await l2TokenReceiver.getAddress()],
    ['L2MessageReceiver', await l2MessageReceiver.getAddress()],
    ['MOR', await MOR.getAddress()],
  );
};

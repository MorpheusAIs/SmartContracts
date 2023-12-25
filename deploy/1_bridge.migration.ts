import { DefaultStorage, Deployer, Reporter } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import {
  L2MessageReceiver__factory,
  L2TokenReceiver__factory,
  MOR__factory,
  NonfungiblePositionManagerMock__factory,
  StETHMock__factory,
  SwapRouterMock__factory,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { IL2TokenReceiver } from '@/generated-types/ethers/contracts/L2TokenReceiver';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let WStETH: string;
  let swapRouter: string;
  let nonfungiblePositionManager: string;

  if (config.L2) {
    WStETH = config.L2.wStEth;
    swapRouter = config.L2.swapRouter;
    nonfungiblePositionManager = config.L2.nonfungiblePositionManager;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory, [], { name: 'StETH on L2' });
    const stETH = await stETHMock.getAddress();

    const wStEthMock = await deployer.deploy(WStETHMock__factory, [stETH], { name: 'Wrapped stETH on L2' });
    WStETH = await wStEthMock.getAddress();

    const swapRouterMock = await deployer.deploy(SwapRouterMock__factory);
    swapRouter = await swapRouterMock.getAddress();

    const nonfungiblePositionManagerMock = await deployer.deploy(NonfungiblePositionManagerMock__factory);
    nonfungiblePositionManager = await nonfungiblePositionManagerMock.getAddress();
  }

  const MOR = await deployer.deploy(MOR__factory, [config.cap]);

  const swapParams: IL2TokenReceiver.SwapParamsStruct = {
    tokenIn: WStETH,
    tokenOut: MOR.address,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };
  const l2TokenReceiver = await deployer.deploy(L2TokenReceiver__factory, [
    swapRouter,
    nonfungiblePositionManager,
    swapParams,
  ]);
  DefaultStorage.set('l2TokenReceiver', l2TokenReceiver.address);

  const l2MessageReceiver = await deployer.deploy(L2MessageReceiver__factory);
  DefaultStorage.set('l2MessageReceiver', l2MessageReceiver.address);

  await MOR.transferOwnership(l2MessageReceiver);

  Reporter.reportContracts(
    ['L2TokenReceiver', l2TokenReceiver.address],
    ['l2MessageReceiver', l2MessageReceiver.address],
    ['MOR', MOR.address],
  );
};

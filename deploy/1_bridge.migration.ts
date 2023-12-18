import {
  ISwap,
  LZEndpointMock__factory,
  MOR__factory,
  NonfungiblePositionManagerMock__factory,
  StETHMock__factory,
  SwapRouterMock__factory,
  Swap__factory,
  TokenController__factory,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { DefaultStorage, Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;
  let WStETH: string;
  let swapRouter: string;
  let nonfungiblePositionManager: string;
  let wStEthOnL2: string;

  if (config.swapAddresses) {
    stETH = config.swapAddresses.stEth;
    WStETH = config.swapAddresses.wStEth;
    swapRouter = config.swapAddresses.swapRouter;
    nonfungiblePositionManager = config.swapAddresses.nonfungiblePositionManager;
    wStEthOnL2 = config.swapAddresses.wStEthOnL2;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory, [], { name: 'StETH on L2' });
    stETH = await stETHMock.getAddress();

    const wstETHMock = await deployer.deploy(WStETHMock__factory, [stETH]);
    WStETH = await wstETHMock.getAddress();

    const swapRouterMock = await deployer.deploy(SwapRouterMock__factory);
    swapRouter = await swapRouterMock.getAddress();

    const nonfungiblePositionManagerMock = await deployer.deploy(NonfungiblePositionManagerMock__factory);
    nonfungiblePositionManager = await nonfungiblePositionManagerMock.getAddress();

    const wStEthOnL2Mock = await deployer.deploy(WStETHMock__factory, [stETH], { name: 'Wrapped stETH on L2' });
    wStEthOnL2 = await wStEthOnL2Mock.getAddress();
  }

  let receiverLzEndpoint: string;
  if (config.lzConfig) {
    receiverLzEndpoint = config.lzConfig.receiverLzEndpoint;
  } else {
    // deploy mock
    const receiverLzEndpointMock = await deployer.deploy(
      LZEndpointMock__factory,
      [config.chainsConfig.receiverChainId],
      { name: 'LZEndpoint on L2' },
    );
    receiverLzEndpoint = await receiverLzEndpointMock.getAddress();
  }

  const MOR = await deployer.deploy(MOR__factory, [config.cap]);

  const swapParams: ISwap.SwapParamsStruct = {
    tokenIn: stETH,
    tokenOut: MOR.address,
    intermediateToken: WStETH,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };
  const swap = await deployer.deploy(Swap__factory, [swapRouter, nonfungiblePositionManager, swapParams]);

  const receiverLzConfig: IL1Sender.LzConfigStruct = {
    lzEndpoint: receiverLzEndpoint,
    communicator: ZERO_ADDR, // TODO: set correct address of Bridge
    communicatorChainId: config.chainsConfig.senderChainId,
  };
  const tokenController = await deployer.deploy(TokenController__factory, [wStEthOnL2, MOR, swap, receiverLzConfig]);
  DefaultStorage.set('tokenControllerOnL2', tokenController.address);

  await MOR.transferOwnership(tokenController);

  Reporter.reportContracts(['Swap', swap.address], ['TokenController', tokenController.address], ['MOR', MOR.address]);
};

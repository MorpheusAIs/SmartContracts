import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import {
  ERC1967Proxy__factory,
  IL2TokenReceiverV2,
  L2MessageReceiver__factory,
  L2TokenReceiverV2__factory,
  MOROFT__factory,
} from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();
  if (config.L2 === undefined) {
    return;
  }

  const WStETH = config.L2.wStEth;
  const swapRouter = config.L2.swapRouter;
  const nonfungiblePositionManager = config.L2.nonfungiblePositionManager;

  const l2TokenReceiverImpl = await deployer.deploy(L2TokenReceiverV2__factory);
  const l2TokenReceiverProxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await l2TokenReceiverImpl.getAddress(), '0x'],
    {
      name: 'L2TokenReceiver Proxy',
    },
  );
  const l2TokenReceiver = await deployer.deployed(L2TokenReceiverV2__factory, await l2TokenReceiverProxy.getAddress());

  const l2MessageReceiverImpl = await deployer.deploy(L2MessageReceiver__factory);
  const l2MessageReceiverProxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await l2MessageReceiverImpl.getAddress(), '0x'],
    {
      name: 'L2MessageReceiver Proxy',
    },
  );
  const l2MessageReceiver = await deployer.deployed(
    L2MessageReceiver__factory,
    await l2MessageReceiverProxy.getAddress(),
  );
  await l2MessageReceiver.L2MessageReceiver__init();

  const layerZeroEndpoint = '0x1a44076050125825900e736c501f859c50fe728c';
  const WETH = '0x52D00439eADfc53D0005dcaF1914BAf9015f82fe';

  const MOR = await deployer.deploy(MOROFT__factory, [
    layerZeroEndpoint,
    await (await deployer.getSigner()).getAddress(),
    await l2MessageReceiver.getAddress(),
  ]);

  const secondSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
    tokenIn: WETH,
    tokenOut: MOR,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };

  await l2TokenReceiver.L2TokenReceiver__init(swapRouter, nonfungiblePositionManager, secondSwapParams);

  const firstSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
    tokenIn: WStETH,
    tokenOut: WETH,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };
  await l2TokenReceiver.editParams(firstSwapParams, true);

  Reporter.reportContracts(
    ['L2TokenReceiver', await l2TokenReceiver.getAddress()],
    ['L2MessageReceiver', await l2MessageReceiver.getAddress()],
    ['MOR', await MOR.getAddress()],
  );
};

// npx hardhat migrate --network arbitrum_sepolia --only 1 --verify
// npx hardhat migrate --network arbitrum --only 1 --verify

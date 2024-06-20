/* eslint-disable @typescript-eslint/no-explicit-any */
import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  IL2TokenReceiverV2,
  L2MessageReceiverV2__factory,
  L2TokenReceiverV2,
  L2TokenReceiverV2__factory,
  L2TokenReceiver__factory,
} from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const l2TokenReceiverOld = await deployer.deployed(
    L2TokenReceiver__factory,
    '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE',
  );

  const wstEth = '0x5979D7b546E38E414F7E9822514be443A4800529';
  const weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const l2TokenReceiverV2Impl = await deployer.deploy(L2TokenReceiverV2__factory);

  Reporter.reportContracts(['L2TokenReceiverV2', await l2TokenReceiverV2Impl.getAddress()]);

  // await l2TokenReceiverOld.upgradeTo(await l2TokenReceiverV2Impl.getAddress());

  // const l2TokenReceiver = (await deployer.deployed(
  //   L2TokenReceiverV2__factory,
  //   await l2TokenReceiverV2Impl.getAddress(),
  // )) as L2TokenReceiverV2;

  // const firstSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
  //   tokenIn: wstEth,
  //   tokenOut: weth,
  //   fee: 100,
  //   sqrtPriceLimitX96: 0,
  // };

  // // const secondSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
  // //   tokenIn: weth,
  // //   tokenOut: moroft,
  // //   fee: 3000,
  // //   sqrtPriceLimitX96: 0,
  // // };

  // await l2TokenReceiver.editParams(firstSwapParams, true);
};

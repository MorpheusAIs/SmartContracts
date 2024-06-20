/* eslint-disable @typescript-eslint/no-explicit-any */
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  IL2MessageReceiver,
  IL2TokenReceiverV2,
  L2MessageReceiver__factory,
  L2TokenReceiverV2__factory,
  MOROFT__factory,
} from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const signer = await ethers.getImpersonatedSigner('0x151c2b49CdEC10B150B2763dF3d1C00D70C90956');

  const l2MessageReceiver = await deployer.deployed(
    L2MessageReceiver__factory,
    '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427',
  );

  const weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const layerZeroEndpoint_ = '0x1a44076050125825900e736c501f859c50fe728c';
  const delegate = '0x151c2b49CdEC10B150B2763dF3d1C00D70C90956';
  const minter = await l2MessageReceiver.getAddress();

  const moroft = await deployer.deploy(MOROFT__factory, [layerZeroEndpoint_, delegate, minter]);

  Reporter.reportContracts(['MOROFT', await moroft.getAddress()]);

  const config: IL2MessageReceiver.ConfigStruct = {
    gateway: '0x3c2269811836af69497E5F486A85D7316753cf62',
    sender: '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84',
    senderChainId: 101n,
  };

  console.log('config', config);

  await l2MessageReceiver.setParams(await moroft.getAddress(), config);

  const l2TokenReceiver = await deployer.deployed(L2TokenReceiverV2__factory, '0x');

  const secondSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
    tokenIn: weth,
    tokenOut: moroft,
    fee: 3000,
    sqrtPriceLimitX96: 0,
  };

  await l2TokenReceiver.connect(signer).editParams(secondSwapParams, false);
};

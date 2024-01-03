import { Deployer } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import {
  L1Sender__factory,
  L2MessageReceiver__factory,
  LZEndpointMock__factory,
  MOR__factory,
} from '@/generated-types/ethers';
import { IL2MessageReceiver } from '@/generated-types/ethers/contracts/L2MessageReceiver';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig(await deployer.getChainId());

  let lzEndpointL2: string;
  if (config.lzConfig) {
    lzEndpointL2 = config.lzConfig.lzEndpointL2;
  } else {
    // deploy mock
    const lzEndpointL2Mock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.receiverChainId], {
      name: 'LZEndpoint on L2',
    });
    lzEndpointL2 = await lzEndpointL2Mock.getAddress();
  }

  const l2MessageReceiver = await deployer.deployed(L2MessageReceiver__factory, 'L2MessageReceiver Proxy');

  const l1Sender = await deployer.deployed(L1Sender__factory, 'L1Sender Proxy');

  const mor = await deployer.deployed(MOR__factory);

  const l2MessageReceiverConfig: IL2MessageReceiver.ConfigStruct = {
    gateway: lzEndpointL2,
    sender: l1Sender,
    senderChainId: config.chainsConfig.senderChainId,
  };

  await l2MessageReceiver.setParams(mor, l2MessageReceiverConfig);
};

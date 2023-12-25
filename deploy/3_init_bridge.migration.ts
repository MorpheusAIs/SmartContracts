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
  const config = parseConfig();

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

  const l2MessageReceiver = await deployer.deployed(
    L2MessageReceiver__factory,
    '0x00df74062dcfe5d708ea34170319377fd1edb9ce',
  );

  // const l1SenderAddress = (await deployer.deployed(L1Sender__factory)).address;
  const l1SenderAddress = '0x3C7bA5cBC373a480531fDb4F63610383263120Db';

  // const morAddress = (await deployer.deployed(MOR__factory)).address;
  const morAddress = '0xCF84E18F1a2803C15675622B24600910dc2a1E13';

  const l2MessageReceiverConfig: IL2MessageReceiver.ConfigStruct = {
    gateway: lzEndpointL2,
    sender: l1SenderAddress,
    senderChainId: config.chainsConfig.senderChainId,
  };

  await l2MessageReceiver.setParams(morAddress, l2MessageReceiverConfig);
};

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
    // '0xc37fF39e5A50543AD01E42C4Cd88c2939dD13002',
  );

  const l1SenderAddress = (await deployer.deployed(L1Sender__factory)).address;
  // const l1SenderAddress = '0xEec0DF0991458274fF0ede917E9827fFc67a8332';

  const morAddress = (await deployer.deployed(MOR__factory)).address;
  // const morAddress = '0x26BCDEb3E4e7EDf5657daF543132cAF792728908';

  const l2MessageReceiverConfig: IL2MessageReceiver.ConfigStruct = {
    gateway: lzEndpointL2,
    sender: l1SenderAddress,
    senderChainId: config.chainsConfig.senderChainId,
  };

  await l2MessageReceiver.setParams(morAddress, l2MessageReceiverConfig);
};

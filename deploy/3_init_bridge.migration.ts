import { Deployer, Reporter, UserStorage } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import { L1Sender__factory, L2MessageReceiver__factory, MOR__factory } from '@/generated-types/ethers';
import { IL2MessageReceiver } from '@/generated-types/ethers/contracts/L2MessageReceiver';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig(await deployer.getChainId());

  let lzEndpointL2: string;
  if (config.lzConfig) {
    lzEndpointL2 = config.lzConfig.lzEndpointL2;
  } else {
    // deploy mock
    // const lzEndpointL2Mock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.receiverChainId], {
    //   name: 'LZEndpoint on L2',
    // });
    // lzEndpointL2 = await lzEndpointL2Mock.getAddress();
    return;
  }

  const l2MessageReceiver = L2MessageReceiver__factory.connect(
    // '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427',
    UserStorage.get('L2MessageReceiver Proxy'),
    await deployer.getSigner(),
  );

  // const l1Sender = L1Sender__factory.connect('0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84', await deployer.getSigner());

  // const mor = MOR__factory.connect('0x7431aDa8a591C955a994a21710752EF9b882b8e3', await deployer.getSigner());

  const l1Sender = L1Sender__factory.connect(UserStorage.get('L1Sender Proxy'), await deployer.getSigner());

  const mor = MOR__factory.connect(UserStorage.get('MOR'), await deployer.getSigner());

  const l2MessageReceiverConfig: IL2MessageReceiver.ConfigStruct = {
    gateway: lzEndpointL2,
    sender: l1Sender,
    senderChainId: config.chainsConfig.senderChainId,
  };

  const tx = await l2MessageReceiver.setParams(mor, l2MessageReceiverConfig);

  await Reporter.reportTransactionByHash(tx.hash);
};

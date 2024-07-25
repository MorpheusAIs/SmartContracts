import { Deployer } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import { L1Sender__factory, L2MessageReceiver__factory, MOROFT__factory } from '@/generated-types/ethers';
import { IL2MessageReceiver } from '@/generated-types/ethers/contracts/L2MessageReceiver';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  const l2MessageReceiver = await deployer.deployed(
    L2MessageReceiver__factory,
    '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE',
  );

  // const l1Sender = L1Sender__factory.connect('0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84', await deployer.getSigner());

  // const mor = MOR__factory.connect('0x7431aDa8a591C955a994a21710752EF9b882b8e3', await deployer.getSigner());

  const l1Sender = await deployer.deployed(L1Sender__factory, '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE');

  const mor = await deployer.deployed(MOROFT__factory, '0x3c3A26c978Bf6AF40D7c1A36e9cBD3C1c055786E');

  const l2MessageReceiverConfig: IL2MessageReceiver.ConfigStruct = {
    gateway: config.lzConfig!.lzEndpointL2,
    sender: l1Sender,
    senderChainId: config.chainsConfig.senderChainId,
  };

  await l2MessageReceiver.setParams(mor, l2MessageReceiverConfig);
};

// npx hardhat migrate --network arbitrum_sepolia --only 3 --verify
// npx hardhat migrate --network arbitrum --only 3 --verify

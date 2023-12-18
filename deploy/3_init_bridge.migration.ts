import { L1Sender__factory, L2Receiver__factory } from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { Deployer } from '@solarity/hardhat-migrate';

module.exports = async function (deployer: Deployer) {
  const l2Receiver = await deployer.deployed(L2Receiver__factory);

  const l1SenderAddress = (await deployer.deployed(L1Sender__factory)).address;

  const l2ReceiverConfig: IL1Sender.LzConfigStruct = {
    lzEndpoint: (await l2Receiver.config()).lzEndpoint,
    communicator: l1SenderAddress,
    communicatorChainId: (await l2Receiver.config()).communicatorChainId,
  };
  await l2Receiver.setParams(await l2Receiver.depositToken(), await l2Receiver.rewardToken(), l2ReceiverConfig);
};

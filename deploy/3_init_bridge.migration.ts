import { L1Sender__factory, TokenController__factory } from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { Deployer } from '@solarity/hardhat-migrate';

module.exports = async function (deployer: Deployer) {
  const tokenController = await deployer.deployed(TokenController__factory);

  const l1SenderAddress = (await deployer.deployed(L1Sender__factory)).address;

  const tokenControllerConfig: IL1Sender.LzConfigStruct = {
    lzEndpoint: (await tokenController.config()).lzEndpoint,
    communicator: l1SenderAddress,
    communicatorChainId: (await tokenController.config()).communicatorChainId,
  };
  await tokenController.setParams(
    await tokenController.investToken(),
    await tokenController.rewardToken(),
    tokenControllerConfig,
  );
};

import { Bridge__factory, TokenController__factory } from '@/generated-types/ethers';
import { IBridge } from '@/generated-types/ethers/contracts/Bridge';
import { Deployer } from '@solarity/hardhat-migrate';

module.exports = async function (deployer: Deployer) {
  const tokenController = await deployer.deployed(TokenController__factory);

  const bridgeAddress = (await deployer.deployed(Bridge__factory)).address;

  const tokenControllerConfig: IBridge.LzConfigStruct = {
    lzEndpoint: (await tokenController.config()).lzEndpoint,
    communicator: bridgeAddress,
    communicatorChainId: (await tokenController.config()).communicatorChainId,
  };
  await tokenController.setParams(
    await tokenController.investToken(),
    await tokenController.rewardToken(),
    tokenControllerConfig,
  );
};

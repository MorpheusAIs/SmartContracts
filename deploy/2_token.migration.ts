import {
  Distribution__factory,
  ERC1967Proxy__factory,
  L1Sender__factory,
  LZEndpointMock__factory,
  StETHMock__factory,
} from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { DefaultStorage, Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;

  if (config.swapAddresses) {
    stETH = config.swapAddresses.stEth;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory, { name: 'StETH on L1' });
    stETH = await stETHMock.getAddress();
  }

  let senderLzEndpoint: string;
  if (config.lzConfig) {
    senderLzEndpoint = config.lzConfig.senderLzEndpoint;
  } else {
    // deploy mock
    const senderLzEndpointMock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.senderChainId], {
      name: 'LZEndpoint on L1',
    });
    senderLzEndpoint = await senderLzEndpointMock.getAddress();
  }

  let l1GatewayRouter: string;
  if (config.arbitrumConfig) {
    l1GatewayRouter = config.arbitrumConfig.l1GatewayRouter;
  } else {
    l1GatewayRouter = ZERO_ADDR;
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x']);
  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const senderLzConfig: IL1Sender.LzConfigStruct = {
    lzEndpoint: senderLzEndpoint,
    communicator: DefaultStorage.get('tokenControllerOnL2'),
    communicatorChainId: config.chainsConfig.receiverChainId,
  };
  const l1Sender = await deployer.deploy(L1Sender__factory, [l1GatewayRouter, stETH, senderLzConfig]);

  await distribution.Distribution_init(stETH, l1Sender, config.pools || []);

  if (config.pools) {
    for (let i = 0; i < config.pools.length; i++) {
      const pool = config.pools[i];

      if (pool.whitelistedUsers && pool.whitelistedUsers.length > 0) {
        const amounts = pool.amounts!;
        await distribution.manageUsersInPrivatePool(i, pool.whitelistedUsers, amounts);
      }
    }
  }

  Reporter.reportContracts(
    ['StETH', stETH],
    ['Distribution', await distribution.getAddress()],
    ['L1Sender', await l1Sender.getAddress()],
  );
};

import {
  Bridge__factory,
  Distribution__factory,
  ERC1967Proxy__factory,
  LZEndpointMock__factory,
  MOR__factory,
  StETHMock__factory,
} from '@/generated-types/ethers';
import { IBridge } from '@/generated-types/ethers/contracts/Bridge';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;

  if (config.swapAddresses) {
    stETH = config.swapAddresses.stEth;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory);
    stETH = await stETHMock.getAddress();
  }

  let senderLzEndpoint: string;
  if (config.lzConfig) {
    senderLzEndpoint = config.lzConfig.senderLzEndpoint;
  } else {
    // deploy mock
    const senderLzEndpointMock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.senderChainId]);
    senderLzEndpoint = await senderLzEndpointMock.getAddress();
  }

  let l1GatewayRouter: string;
  if (config.arbitrumConfig) {
    l1GatewayRouter = config.arbitrumConfig.l1GatewayRouter;
  } else {
    l1GatewayRouter = '0x00000';
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x']);
  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const MOR = await deployer.deploy(MOR__factory, [distribution, config.cap]);

  const senderLzConfig: IBridge.LzConfigStruct = {
    lzEndpoint: senderLzEndpoint,
    communicator: (await deployer.deployed(Bridge__factory)).address,
    communicatorChainId: config.chainsConfig.receiverChainId,
  };
  const bridge = await deployer.deploy(Bridge__factory, [l1GatewayRouter, stETH, senderLzConfig]);

  await distribution.Distribution_init(MOR, stETH, bridge, config.pools || []);

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
    ['MOR', MOR.address],
    ['StETH', stETH],
    ['Distribution', await distribution.getAddress()],
    ['Bridge', await bridge.getAddress()],
  );
};

import { DefaultStorage, Deployer, Reporter } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import {
  Distribution__factory,
  ERC1967Proxy__factory,
  L1Sender__factory,
  LZEndpointMock__factory,
  StETHMock__factory,
  WStETHMock__factory,
} from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { ZERO_ADDR } from '@/scripts/utils/constants';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;
  let wStEth: string;

  if (config.L1) {
    stETH = config.L1.stEth;
    wStEth = config.L1.wStEth;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory, { name: 'StETH on L1' });
    stETH = await stETHMock.getAddress();

    const wStEthMock = await deployer.deploy(WStETHMock__factory, [stETH], { name: 'wStETH on L1' });
    wStEth = await wStEthMock.getAddress();
  }

  let lzEndpointL1: string;
  if (config.lzConfig) {
    lzEndpointL1 = config.lzConfig.lzEndpointL1;
  } else {
    // deploy mock
    const LzEndpointL1Mock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.senderChainId], {
      name: 'LZEndpoint on L1',
    });
    lzEndpointL1 = await LzEndpointL1Mock.getAddress();
  }

  let arbitrumBridgeGatewayRouter: string;
  if (config.arbitrumConfig) {
    arbitrumBridgeGatewayRouter = config.arbitrumConfig.arbitrumBridgeGatewayRouter;
  } else {
    arbitrumBridgeGatewayRouter = ZERO_ADDR;
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const distributionProxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x'], {
    name: 'Distribution Proxy',
  });
  const distribution = Distribution__factory.connect(distributionProxy.address, await deployer.getSigner());

  const l1SenderImpl = await deployer.deploy(L1Sender__factory);
  const l1SenderProxy = await deployer.deploy(ERC1967Proxy__factory, [l1SenderImpl, '0x'], {
    name: 'L1Sender Proxy',
  });
  const l1Sender = L1Sender__factory.connect(l1SenderProxy.address, await deployer.getSigner());
  await l1Sender.L1Sender__init();

  const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
    gateway: lzEndpointL1,
    receiver: DefaultStorage.get('l2MessageReceiver'),
    // receiver: '0xc37fF39e5A50543AD01E42C4Cd88c2939dD13002',
    receiverChainId: config.chainsConfig.receiverChainId,
  };
  await l1Sender.setRewardTokenConfig(rewardTokenConfig);

  const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
    token: wStEth,
    gateway: arbitrumBridgeGatewayRouter,
    receiver: DefaultStorage.get('l2TokenReceiver'),
    // receiver: '0x56c7db3D200c92eAAb8a2c4a9C1DcB8c50D4041F',
  };
  await l1Sender.setDepositTokenConfig(depositTokenConfig);

  await l1Sender.transferOwnership(await distribution.getAddress());

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
    ['Distribution', await distribution.getAddress()],
    ['L1Sender', await l1Sender.getAddress()],
  );
};

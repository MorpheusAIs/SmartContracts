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
import { ETHER_ADDR } from '@/scripts/utils/constants';

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
    arbitrumBridgeGatewayRouter = ETHER_ADDR;
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x']);
  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const l1Sender = await deployer.deploy(L1Sender__factory);

  const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
    gateway: lzEndpointL1,
    // receiver: DefaultStorage.get('l2MessageReceiver'),
    receiver: '0x00df74062DCFe5D708eA34170319377fD1EDB9Ce',
    receiverChainId: config.chainsConfig.receiverChainId,
  };
  await l1Sender.setRewardTokenConfig(rewardTokenConfig);

  const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
    token: wStEth,
    gateway: arbitrumBridgeGatewayRouter,
    // receiver: DefaultStorage.get('l2TokenReceiver'),
    receiver: '0xb6067C1B07e3Fe12d18C11a0cc6F1366BD70EC95',
  };
  await l1Sender.setDepositTokenConfig(depositTokenConfig);

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

  Reporter.reportContracts(['Distribution', await distribution.getAddress()], ['L1Sender', l1Sender.address]);
};

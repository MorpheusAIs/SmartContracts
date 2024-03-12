import { Deployer, Reporter, UserStorage } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import { Distribution__factory, ERC1967Proxy__factory, L1Sender__factory } from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { ZERO_ADDR } from '@/scripts/utils/constants';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig(await deployer.getChainId());

  let stETH: string;
  let wStEth: string;

  if (config.L1) {
    stETH = config.L1.stEth;
    wStEth = config.L1.wStEth;
  } else {
    // deploy mock
    // const stETHMock = await deployer.deploy(StETHMock__factory, { name: 'StETH on L1' });
    // stETH = await stETHMock.getAddress();

    // const wStEthMock = await deployer.deploy(WStETHMock__factory, [stETH], { name: 'wStETH on L1' });
    // wStEth = await wStEthMock.getAddress();
    return;
  }

  let lzEndpointL1: string;
  if (config.lzConfig) {
    lzEndpointL1 = config.lzConfig.lzEndpointL1;
  } else {
    // deploy mock
    // const LzEndpointL1Mock = await deployer.deploy(LZEndpointMock__factory, [config.chainsConfig.senderChainId], {
    //   name: 'LZEndpoint on L1',
    // });
    // lzEndpointL1 = await LzEndpointL1Mock.getAddress();
    return;
  }

  let arbitrumBridgeGatewayRouter: string;
  if (config.arbitrumConfig) {
    arbitrumBridgeGatewayRouter = config.arbitrumConfig.arbitrumBridgeGatewayRouter;
  } else {
    return;
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const distributionProxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x'], {
    name: 'Distribution Proxy',
  });
  const distribution = Distribution__factory.connect(await distributionProxy.getAddress(), await deployer.getSigner());

  const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
    gateway: lzEndpointL1,
    // receiver: '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427',
    receiver: UserStorage.get('L2MessageReceiver Proxy'),
    receiverChainId: config.chainsConfig.receiverChainId,
    zroPaymentAddress: ZERO_ADDR,
    adapterParams: '0x',
  };
  const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
    token: wStEth,
    gateway: arbitrumBridgeGatewayRouter,
    // receiver: '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
    receiver: UserStorage.get('L2TokenReceiver Proxy'),
  };

  const l1SenderImpl = await deployer.deploy(L1Sender__factory);
  const l1SenderProxy = await deployer.deploy(ERC1967Proxy__factory, [l1SenderImpl, '0x'], {
    name: 'L1Sender Proxy',
  });
  UserStorage.set('L1Sender Proxy', await l1SenderProxy.getAddress());
  const l1Sender = L1Sender__factory.connect(await l1SenderProxy.getAddress(), await deployer.getSigner());
  await l1Sender.L1Sender__init(distribution, rewardTokenConfig, depositTokenConfig);

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

import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { parseConfig } from './helpers/config-parser';

import { Distribution__factory, ERC1967Proxy__factory, L1Sender__factory } from '@/generated-types/ethers';
import { IL1Sender } from '@/generated-types/ethers/contracts/L1Sender';
import { ZERO_ADDR } from '@/scripts/utils/constants';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig(await deployer.getChainId());

  if (!config.L1) {
    return;
  }
  const stETH = config.L1.stEth;
  const wStEth = config.L1.wStEth;

  const lzEndpointL1 = config.lzConfig!.lzEndpointL1;
  const arbitrumBridgeGatewayRouter = config.arbitrumConfig!.arbitrumBridgeGatewayRouter;

  // const distributionImpl = await deployer.deploy(Distribution__factory);
  const distributionImpl = await deployer.deployed(Distribution__factory, '0x24C09A0C047e8A439f26682Ea51c7157b3cCc20b');
  const distributionProxy = await deployer.deploy(ERC1967Proxy__factory, [await distributionImpl.getAddress(), '0x'], {
    name: 'Distribution Proxy',
  });
  const distribution = await deployer.deployed(Distribution__factory, await distributionProxy.getAddress());

  const rewardTokenConfig: IL1Sender.RewardTokenConfigStruct = {
    gateway: lzEndpointL1,
    receiver: '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE',
    // receiver: UserStorage.get('L2MessageReceiver Proxy'),
    receiverChainId: config.chainsConfig.receiverChainId,
    zroPaymentAddress: ZERO_ADDR,
    adapterParams: '0x',
  };
  const depositTokenConfig: IL1Sender.DepositTokenConfigStruct = {
    token: wStEth,
    gateway: arbitrumBridgeGatewayRouter,
    receiver: '0x2e1fF173085A5ef12046c27E442f12f79A0092b7',
    // receiver: UserStorage.get('L2TokenReceiver Proxy'),
  };

  const l1SenderImpl = await deployer.deployed(L1Sender__factory, '0x6b1A3D8F84094667e38247D6FcA6F814e11aE9fE');
  const l1SenderProxy = await deployer.deploy(ERC1967Proxy__factory, [await l1SenderImpl.getAddress(), '0x'], {
    name: 'L1Sender Proxy',
  });
  const l1Sender = await deployer.deployed(L1Sender__factory, await l1SenderProxy.getAddress());
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

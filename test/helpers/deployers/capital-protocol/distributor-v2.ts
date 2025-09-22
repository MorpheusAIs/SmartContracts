import { ethers } from 'hardhat';

import {
  AavePoolAddressesProviderMock,
  AavePoolDataProviderMock,
  ChainLinkDataConsumer,
  ChainLinkDataConsumerMock,
  DistributorV2,
  L1SenderMock,
  L1SenderV2,
  RewardPool,
  RewardPoolMock,
} from '@/generated-types/ethers';
import '@/generated-types/ethers/contracts/mock';

export const deployDistributorV2 = async (
  chainLinkDataConsumer: ChainLinkDataConsumer | ChainLinkDataConsumerMock,
  aavePoolDataProvider: string | AavePoolDataProviderMock,
  aavePoolAddressesProvider: string | AavePoolAddressesProviderMock,
  rewardPool: RewardPool | RewardPoolMock,
  l1Sender: L1SenderV2 | L1SenderMock,
): Promise<DistributorV2> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('DistributorV2'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DistributorV2;

  await contract.DistributorV2_init(
    chainLinkDataConsumer,
    aavePoolDataProvider,
    aavePoolAddressesProvider,
    rewardPool,
    l1Sender,
  );

  return contract;
};

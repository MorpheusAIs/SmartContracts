import { ethers } from 'hardhat';

import {
  AavePoolAddressesProviderMock,
  AavePoolDataProviderMock,
  ChainLinkDataConsumer,
  ChainLinkDataConsumerMock,
  DistributorV3,
  L1SenderV3,
  L1SenderV3Mock,
  RewardPool,
  RewardPoolMock,
} from '@/generated-types/ethers';
import '@/generated-types/ethers/contracts/mock';

export const deployDistributorV3 = async (
  chainLinkDataConsumer: ChainLinkDataConsumer | ChainLinkDataConsumerMock,
  aavePoolDataProvider: string | AavePoolDataProviderMock,
  aavePoolAddressesProvider: string | AavePoolAddressesProviderMock,
  rewardPool: RewardPool | RewardPoolMock,
  l1Sender: L1SenderV3 | L1SenderV3Mock,
): Promise<DistributorV3> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('DistributorV3'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as DistributorV3;

  await contract.DistributorV3_init(
    chainLinkDataConsumer,
    aavePoolDataProvider,
    aavePoolAddressesProvider,
    rewardPool,
    l1Sender,
  );

  return contract;
};

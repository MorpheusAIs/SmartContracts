import { ethers } from 'hardhat';

import {
  AavePoolDataProviderMock,
  AavePoolMock,
  ChainLinkDataConsumerMock,
  Distributor,
  L1SenderMock,
  L1SenderV2,
  RewardPoolMock,
} from '@/generated-types/ethers';
import '@/generated-types/ethers/contracts/mock';

export const deployDistributor = async (
  chainLinkDataConsumer: ChainLinkDataConsumerMock,
  aavePool: AavePoolMock,
  aavePoolDataProvider: AavePoolDataProviderMock,
  rewardPool: RewardPoolMock,
  l1Sender: L1SenderV2 | L1SenderMock,
): Promise<Distributor> => {
  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('Distributor'),
    ethers.getContractFactory('ERC1967Proxy'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as Distributor;

  await contract.Distributor_init(chainLinkDataConsumer, aavePool, aavePoolDataProvider, rewardPool, l1Sender);

  return contract;
};

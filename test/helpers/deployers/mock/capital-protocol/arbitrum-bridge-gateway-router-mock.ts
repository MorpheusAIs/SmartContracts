import { ethers } from 'hardhat';

import { ArbitrumBridgeGatewayRouterMock } from '@/generated-types/ethers';

export const deployArbitrumBridgeGatewayRouterMock = async (): Promise<ArbitrumBridgeGatewayRouterMock> => {
  const [factory] = await Promise.all([ethers.getContractFactory('ArbitrumBridgeGatewayRouterMock')]);

  const contract = await factory.deploy();

  return contract;
};

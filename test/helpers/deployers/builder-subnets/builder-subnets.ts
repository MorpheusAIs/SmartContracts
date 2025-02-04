import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import { BuilderSubnets, FeeConfig, MOROFT } from '@/generated-types/ethers';

export const deployBuilderSubnets = async (
  stakeToken: MOROFT,
  feeConfig: FeeConfig,
  treasury: SignerWithAddress,
  minWithdrawLockPeriodAfterStake: number,
): Promise<BuilderSubnets> => {
  const libFactory = await ethers.getContractFactory('LinearDistributionIntervalDecrease');
  const lib = await libFactory.deploy();

  const [implFactory, proxyFactory] = await Promise.all([
    ethers.getContractFactory('BuilderSubnets', {
      libraries: {
        LinearDistributionIntervalDecrease: await lib.getAddress(),
      },
    }),
    ethers.getContractFactory('ERC1967Proxy'),
    ethers.getContractFactory('LinearDistributionIntervalDecrease'),
  ]);

  const impl = await implFactory.deploy();
  const proxy = await proxyFactory.deploy(impl, '0x');
  const contract = impl.attach(proxy) as BuilderSubnets;

  await contract.BuilderSubnets_init(stakeToken, feeConfig, treasury, minWithdrawLockPeriodAfterStake);

  return contract;
};

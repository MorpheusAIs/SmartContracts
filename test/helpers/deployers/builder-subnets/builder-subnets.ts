import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import { BuilderSubnets, BuildersV3, FeeConfig, MOROFT } from '@/generated-types/ethers';

export const deployBuilderSubnets = async (
  stakeToken: MOROFT,
  feeConfig: FeeConfig,
  treasury: SignerWithAddress,
  minWithdrawLockPeriodAfterStake: number,
  buildersV3Predefined?: BuildersV3,
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

  let buildersV3;
  if (!buildersV3Predefined) {
    const [buildersV3Factory] = await Promise.all([ethers.getContractFactory('BuildersV3')]);
    buildersV3 = await buildersV3Factory.deploy();
  } else {
    buildersV3 = buildersV3Predefined;
  }

  await contract.BuilderSubnets_init(stakeToken, feeConfig, treasury, minWithdrawLockPeriodAfterStake, buildersV3);

  return contract;
};

import { ethers } from 'hardhat';

import { IDistribution } from '@/generated-types/ethers';

async function main() {
  const signer = await ethers.getImpersonatedSigner('0x040EF6Fb6592A70291954E2a6a1a8F320FF10626');

  const distributionFactory = await ethers.getContractFactory('Distribution', {
    libraries: {
      LinearDistributionIntervalDecrease: '0x7431aDa8a591C955a994a21710752EF9b882b8e3',
    },
    signer: signer,
  });

  const distribution = distributionFactory.attach('0x2e1fF173085A5ef12046c27E442f12f79A0092b7') as IDistribution;

  await distribution.stake(0, 1000000000000000000n);

  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/stake.ts --network localhost

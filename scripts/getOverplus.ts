import { ethers } from 'hardhat';

import { IDistribution } from '@/generated-types/ethers';

async function main() {
  const distributionFactory = await ethers.getContractFactory('Distribution', {
    libraries: {
      LinearDistributionIntervalDecrease: '0x7431aDa8a591C955a994a21710752EF9b882b8e3',
    },
  });

  const distribution = distributionFactory.attach('0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790') as IDistribution;

  console.log(await distribution.overplus());

  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/getOverplus.ts --network localhost

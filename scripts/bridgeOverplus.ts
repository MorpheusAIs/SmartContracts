import { ethers } from 'hardhat';

import { wei } from './utils/utils';

import { Distribution } from '@/generated-types/ethers';

async function main() {
  const owner = await ethers.getImpersonatedSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');

  const signer = await ethers.getImpersonatedSigner('0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E');

  await owner.sendTransaction({
    to: signer,
    value: wei('0.1'),
  });

  const distributionFactory = await ethers.getContractFactory('Distribution', {
    libraries: {
      LinearDistributionIntervalDecrease: '0x7431aDa8a591C955a994a21710752EF9b882b8e3',
    },
    signer: signer,
  });

  const distribution = distributionFactory.attach('0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790') as Distribution;

  // await distribution.transferOwnership(owner);

  // console.log('transferred Ownership');

  console.log(await distribution.overplus());

  await distribution.connect(owner).bridgeOverplus(100000, 60000000, 100000000000000, { value: 200000000000000 });

  console.log(await distribution.overplus());

  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/bridgeOverplus.ts --network localhost

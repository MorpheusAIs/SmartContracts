import { ethers } from 'hardhat';

import { L2TokenReceiver } from '@/generated-types/ethers';

async function main() {
  const L2TokenReceiver = await ethers.getContractFactory('L2TokenReceiver');
  const l2TokenReceiver = L2TokenReceiver.attach('0x2C0f43E5C92459F62C102517956A95E88E177e95') as L2TokenReceiver;

  const tx = await l2TokenReceiver.swap(500, 0);
  console.log(tx);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/tryTokensSwap.ts --network arbitrum_goerli

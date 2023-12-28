import { ethers } from 'hardhat';

import { L2TokenReceiver } from '@/generated-types/ethers';

async function setParams(l2TokenReceiver: L2TokenReceiver) {
  await l2TokenReceiver.editParams({
    tokenIn: '0x87726993938107d9B9ce08c99BDde8736D899a5D',
    tokenOut: '0xCF84E18F1a2803C15675622B24600910dc2a1E13',
    fee: 10000,
    sqrtPriceLimitX96: 0,
  });
  console.log(await l2TokenReceiver.params());
}

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

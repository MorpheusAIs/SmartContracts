import { ethers } from 'hardhat';

import { fromWei } from './utils/utils';

import { MOR } from '@/generated-types/ethers';

async function main() {
  const user = '0x901F2d23823730fb7F2356920e0E273EFdCdFe17';
  const MORFactory = await ethers.getContractFactory('MOR');
  const MOR = MORFactory.attach('0xCF84E18F1a2803C15675622B24600910dc2a1E13') as MOR;

  const balance = await MOR.balanceOf(user);

  console.log(`MOR balance of ${user}: ${fromWei(balance)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/checkTokenBalance.ts --network arbitrum_goerli

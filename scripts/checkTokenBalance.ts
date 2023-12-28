import { ethers } from 'hardhat';

import { ERC20 } from '@/generated-types/ethers';

async function main() {
  // const user = '0x901F2d23823730fb7F2356920e0E273EFdCdFe17'; // me
  const user = '0xb6067C1B07e3Fe12d18C11a0cc6F1366BD70EC95'; // token receiver
  // const tokenAddress = '0xCF84E18F1a2803C15675622B24600910dc2a1E13'; // MOR
  const tokenAddress = '0x87726993938107d9B9ce08c99BDde8736D899a5D'; // wStETH
  const ERC20Factory = await ethers.getContractFactory('ERC20');
  const token = ERC20Factory.attach(tokenAddress) as ERC20;

  const balance = await token.balanceOf(user);

  console.log(`token ${tokenAddress} balance of ${user}: ${balance}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/checkTokenBalance.ts --network arbitrum_goerli

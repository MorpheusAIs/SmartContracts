import { ethers } from 'hardhat';

import { ERC20, L2TokenReceiver } from '@/generated-types/ethers';

const l2MessageReceiverAddress = '0x2C0f43E5C92459F62C102517956A95E88E177e95';
const wstethAddress = '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f';
const morAddress = '0x454AE850eE61a98BF16FABA3a73fb0dD02D75C40';

async function main() {
  const L2TokenReceiver = await ethers.getContractFactory('L2TokenReceiver');
  const l2TokenReceiver = L2TokenReceiver.attach(l2MessageReceiverAddress) as L2TokenReceiver;

  const ERC20Factory = await ethers.getContractFactory('ERC20');
  const wsteth = ERC20Factory.attach(wstethAddress) as ERC20;
  const mor = ERC20Factory.attach(morAddress) as ERC20;

  const wstethBalance = await wsteth.balanceOf(l2MessageReceiverAddress);
  const morBalance = await mor.balanceOf(l2MessageReceiverAddress);

  console.log(`wsteth balance of ${l2MessageReceiverAddress}: ${wstethBalance}`);
  console.log(`mor balance of ${l2MessageReceiverAddress}:    ${morBalance}`);

  const tx = await l2TokenReceiver.increaseLiquidityCurrentRange(86416, wstethBalance, morBalance, 0, 0);
  await tx.wait();

  console.log('liquidity added');

  const wstethBalanceAfter = await wsteth.balanceOf(l2MessageReceiverAddress);
  const morBalanceAfter = await mor.balanceOf(l2MessageReceiverAddress);

  console.log(`wsteth balance of ${l2MessageReceiverAddress}: ${wstethBalanceAfter}`);
  console.log(`mor balance of ${l2MessageReceiverAddress}:    ${morBalanceAfter}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/tryAddLiquidity.ts --network arbitrum_goerli

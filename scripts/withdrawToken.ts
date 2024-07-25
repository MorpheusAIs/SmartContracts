import { ethers } from 'hardhat';

import { L2TokenReceiverV2 } from '@/generated-types/ethers';

async function main() {
  const wstEth = '0x5979D7b546E38E414F7E9822514be443A4800529';

  const signer = await ethers.getImpersonatedSigner('0x151c2b49CdEC10B150B2763dF3d1C00D70C90956');

  const L2TokenReceiverV2Factory = await ethers.getContractFactory('L2TokenReceiverV2', signer);

  const l2TokenReceiver = L2TokenReceiverV2Factory.attach(
    '0x47176b2af9885dc6c4575d4efd63895f7aaa4790',
  ) as L2TokenReceiverV2;

  await l2TokenReceiver.withdrawToken('0x151c2b49CdEC10B150B2763dF3d1C00D70C90956', wstEth, 729987493896647493703n);
  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/withdrawToken.ts --network localhost

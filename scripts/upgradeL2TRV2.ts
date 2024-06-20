import { ethers } from 'hardhat';

import { IL2TokenReceiverV2, L2TokenReceiver, L2TokenReceiverV2 } from '@/generated-types/ethers';

async function main() {
  const wstEth = '0x5979D7b546E38E414F7E9822514be443A4800529';
  const weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const firstSwapParams: IL2TokenReceiverV2.SwapParamsStruct = {
    tokenIn: wstEth,
    tokenOut: weth,
    fee: 100,
    sqrtPriceLimitX96: 0,
  };

  const signer = await ethers.getImpersonatedSigner('0x151c2b49CdEC10B150B2763dF3d1C00D70C90956');

  const L2TokenReceiverFactory = await ethers.getContractFactory('L2TokenReceiver', signer);
  const L2TokenReceiverV2Factory = await ethers.getContractFactory('L2TokenReceiverV2', signer);

  const l2TokenReceiverOld = L2TokenReceiverFactory.attach(
    '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
  ) as L2TokenReceiver;

  console.log('l2TokenReceiverOld:', await l2TokenReceiverOld.getAddress());

  console.log('swapParams:', await l2TokenReceiverOld.params());

  const l2TokenReceiverV2Impl = '0x27353fFaDFD53538e8BDF81be7041C56CE2d5ae4';

  console.log('Upgrading L2TokenReceiverV2...');
  await l2TokenReceiverOld.upgradeTo(l2TokenReceiverV2Impl);

  const l2TokenReceiver = L2TokenReceiverV2Factory.attach(await l2TokenReceiverOld.getAddress()) as L2TokenReceiverV2;

  console.log('Editing params...');
  await l2TokenReceiver.editParams(firstSwapParams, true);

  console.log('firstSwapParams:', await l2TokenReceiver.firstSwapParams());
  console.log('secondSwapParams:', await l2TokenReceiver.secondSwapParams());

  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/upgradeL2TRV2.ts --network localhost

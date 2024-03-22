import { ethers } from 'hardhat';

import { wei } from './utils/utils';

import { MOROFT } from '@/generated-types/ethers';

type NetworkConfig = {
  moroftAddress: string;
  moroftContract?: MOROFT;
  chainId: string;
};
const arbitrum: NetworkConfig = {
  moroftAddress: '0xf8c64a7ee33e6552c0dfabd1c6166a05627788da',
  chainId: '40231',
};

const sepolia: NetworkConfig = {
  moroftAddress: '0x7D93F6104f91Faa01Aca440333b6AedBedF61625',
  chainId: '40161',
};

const sender = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4';
const receiver = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4';

const sendTokens = async (amount: bigint, receiver: string, fromConfig: NetworkConfig, toConfig: NetworkConfig) => {
  if (!fromConfig.moroftContract) {
    console.log('Failed to attach contract.');

    return;
  }
  const receiverBytes32Address = ethers.zeroPadValue(receiver, 32);

  const sendParams = {
    dstEid: toConfig.chainId,
    to: receiverBytes32Address,
    amountLD: amount,
    minAmountLD: amount,
    extraOptions: '0x',
    composeMsg: '0x',
    oftCmd: '0x',
  };

  const quoteRes = await fromConfig.moroftContract.quoteSend(sendParams, false);

  const messagingFee = {
    nativeFee: quoteRes[0].toString(),
    lzTokenFee: 0,
  };

  const tx = await fromConfig.moroftContract?.send(sendParams, messagingFee, sender, {
    value: messagingFee.nativeFee,
  });
  await tx.wait();

  console.log(tx.hash);
};
async function main() {
  const MOROFT = await ethers.getContractFactory('MOROFT');

  arbitrum.moroftContract = MOROFT.attach(arbitrum.moroftAddress) as MOROFT;
  sepolia.moroftContract = MOROFT.attach(sepolia.moroftAddress) as MOROFT;

  await sendTokens(wei(1), receiver, sepolia, arbitrum);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/sendMOROFTToAnotherChain.ts --network arbitrum_sepolia

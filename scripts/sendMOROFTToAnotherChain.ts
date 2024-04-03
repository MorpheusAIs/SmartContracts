import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import { wei } from './utils/utils';

import { MOROFT } from '@/generated-types/ethers';

type NetworkConfig = {
  moroftAddress: string;
  moroftContract?: MOROFT;
  chainId: string;
};

const arbitrumSepolia: NetworkConfig = {
  moroftAddress: '0x51f970885e90DA7dc9E3Fee37A115aD04e94F5CE',
  chainId: '40231',
};

const sepolia: NetworkConfig = {
  moroftAddress: '0xAE5227BEfEE7292Ef1a5C2376629b32d65bB29be',
  chainId: '40161',
};

const mumbai: NetworkConfig = {
  moroftAddress: '0xACabF3283a8083868a817C24f17C3c3e2D3339B0',
  chainId: '40109',
};

const sender = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4';
const receiver = '0x19ec1E4b714990620edf41fE28e9a1552953a7F4';

let tx;

const sendTokens = async (
  signer: HardhatEthersSigner,
  amount: bigint,
  receiver: string,
  fromConfig: NetworkConfig,
  toConfig: NetworkConfig,
) => {
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

  tx = await fromConfig.moroftContract.connect(signer).send(sendParams, messagingFee, sender, {
    value: messagingFee.nativeFee,
  });
  await tx.wait();

  console.log('Success: ', tx.hash);
};

const configureBridge = async (signer: HardhatEthersSigner, fromConfig: NetworkConfig, toConfig: NetworkConfig) => {
  if (!fromConfig.moroftContract) {
    console.log('Failed to attach contract.');

    return;
  }

  // Add to contract as allowed peer
  tx = await fromConfig.moroftContract
    .connect(signer)
    .setPeer(toConfig.chainId, ethers.zeroPadValue(toConfig.moroftAddress, 32));
  await tx.wait();
  console.log(
    'Is peer has set:',
    await fromConfig.moroftContract.isPeer(toConfig.chainId, ethers.zeroPadValue(toConfig.moroftAddress, 32)),
  );

  // // !!!!! Use it only for forming `options`. !!!!!
  // const OptionsGenerator = await ethers.getContractFactory('OptionsGenerator');
  // const optionsGenerator = await OptionsGenerator.deploy();

  // // Detect options for enforce params
  // const executorGas = 60000; // Gas limit for the executor
  // const executorValue = 0; // msg.value for the lzReceive() function on destination in wei
  // // https://docs.layerzero.network/v2/developers/evm/gas-settings/options
  // const options = await optionsGenerator.createLzReceiveOption(executorGas, executorValue);
  // console.log('Options for next step: ', options);

  // https://docs.layerzero.network/v2/developers/evm/oapp/overview#message-execution-options
  const enforcedOptionParam = [
    {
      eid: toConfig.chainId,
      msgType: 1,
      options: '0x0003010011010000000000000000000000000000ea60',
    },
  ];

  tx = await fromConfig.moroftContract.connect(signer).setEnforcedOptions(enforcedOptionParam);
  await tx.wait();
};

async function main() {
  // Use `getImpersonatedSigner` for testing on fork
  // const signer = await ethers.getImpersonatedSigner('0x19ec1E4b714990620edf41fE28e9a1552953a7F4');
  const [signer] = await ethers.getSigners();

  const MOROFT = await ethers.getContractFactory('MOROFT');

  arbitrumSepolia.moroftContract = MOROFT.attach(arbitrumSepolia.moroftAddress) as MOROFT;
  sepolia.moroftContract = MOROFT.attach(sepolia.moroftAddress) as MOROFT;
  mumbai.moroftContract = MOROFT.attach(mumbai.moroftAddress) as MOROFT;

  // **** STEP #1 ****
  // Configure from `mumbai` to `sepolia`. Call it from `mumbai`
  // await configureBridge(signer, mumbai, sepolia);

  // Configure from `sepolia` to `mumbai`. Call it from `sepolia`
  // await configureBridge(signer, sepolia, mumbai);
  // END

  // **** STEP #2 ****
  // Send tokens from `mumbai` to `sepolia`. Call it from `mumbai`
  // await sendTokens(signer, wei(100), receiver, mumbai, sepolia);

  // Send tokens from `sepolia` to `mumbai`. Call it from `sepolia`
  await sendTokens(signer, wei(50), receiver, sepolia, mumbai);
  // END
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/sendMOROFTToAnotherChain.ts
// npx hardhat run scripts/sendMOROFTToAnotherChain.ts --network mumbai
// npx hardhat run scripts/sendMOROFTToAnotherChain.ts --network sepolia

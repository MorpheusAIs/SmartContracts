import { ethers } from 'hardhat';

import { ILayerZeroEndpoint } from '@/generated-types/ethers/@layerzerolabs/solidity-examples/contracts/lzApp/interfaces';

async function getNonce() {
  const l2MessageReceiver = await ethers.getContractAt(
    'L2MessageReceiver',
    '0xc37ff39e5a50543ad01e42c4cd88c2939dd13002',
    (await ethers.getSigners())[0],
  );

  console.log(await l2MessageReceiver.nonce());
}

async function main() {
  await getNonce();
  const lzEndpoint = (await ethers.getContractAt(
    '@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol:ILayerZeroEndpoint',
    '0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3',
    (await ethers.getSigners())[0],
  )) as unknown as ILayerZeroEndpoint;

  const remoteAndLocal = ethers.solidityPacked(
    ['address', 'address'],
    ['0xeec0df0991458274ff0ede917e9827ffc67a8332', '0xc37ff39e5a50543ad01e42c4cd88c2939dd13002'],
  );
  const tx = await lzEndpoint.retryPayload(
    '10161',
    remoteAndLocal,
    '0x000000000000000000000000901f2d23823730fb7f2356920e0e273efdcdfe1700000000000000000000000000000000000000000000000322994640a6175555',
  );

  console.log(tx);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/retryPayload.ts --network arbitrum_sepolia

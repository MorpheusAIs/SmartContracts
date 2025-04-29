import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { MOROFT__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const config = {
  lzEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f', // https://sepolia.arbiscan.io/address/0x6EDCE65403992e310A62460808c4b910D972f10f
  minter: '0x19ec1E4b714990620edf41fE28e9a1552953a7F4',
};

module.exports = async function (deployer: Deployer) {
  const signer = await deployer.getSigner();
  const signerAddress = await signer.getAddress();

  const mor = await deployer.deploy(MOROFT__factory, [config.lzEndpoint, signerAddress, signerAddress]);
  await mor.mint(signer, wei(1_000_000));

  Reporter.reportContracts(['MOR', await mor.getAddress()]);
};

// npx hardhat migrate --path-to-migrations ./deploy/mor --network base_sepolia --only 1 --verify

import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { MOROFT__factory } from '@/generated-types/ethers';

const lzEndpointV2 = '0x6edce65403992e310a62460808c4b910d972f10f';

module.exports = async function (deployer: Deployer) {
  const deployerAddress = await (await deployer.getSigner()).getAddress();

  const mor = await deployer.deploy(MOROFT__factory, [lzEndpointV2, deployerAddress, deployerAddress]);

  Reporter.reportContracts(['MOROFT', await mor.getAddress()]);
};

// npx hardhat migrate --only 4
// npx hardhat migrate --network arbitrum_sepolia --only 4 --verify
// npx hardhat migrate --network sepolia --only 4 --verify
// npx hardhat migrate --network mumbai --only 4 --verify

import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { MOROFT__factory } from '@/generated-types/ethers';

const lzEndpointV2 = '0x1a44076050125825900e736c501f859c50fE728c';

module.exports = async function (deployer: Deployer) {
  const mor = await deployer.deploy(MOROFT__factory, [
    lzEndpointV2,
    '0xf3ef00168DD40Eae68A7E670d56C7b8724E0c183',
    '0xf3ef00168DD40Eae68A7E670d56C7b8724E0c183',
  ]);
  Reporter.reportContracts(['MOROFT', await mor.getAddress()]);
};

// npx hardhat migrate --only 4
// npx hardhat migrate --network arbitrum_sepolia --only 4 --verify
// npx hardhat migrate --network sepolia --only 4 --verify
// npx hardhat migrate --network mumbai --only 4 --verify
// npx hardhat migrate --network base_sepolia --only 4 --verify

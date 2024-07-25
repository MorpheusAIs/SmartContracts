import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { StETHMock__factory, WStETHMock__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

module.exports = async function (deployer: Deployer) {
  const stETH = await deployer.deploy(StETHMock__factory);
  const wStETH = await deployer.deploy(WStETHMock__factory, [await stETH.getAddress()]);

  await stETH.mint((await deployer.getSigner()).getAddress(), wei('1000'));
  await wStETH.mint((await deployer.getSigner()).getAddress(), wei('1000'));

  Reporter.reportContracts(['stETH', await stETH.getAddress()], ['wStETH', await wStETH.getAddress()]);
};

// npx hardhat migrate --network sepolia --only 11 --verify
// npx hardhat migrate --network base_sepolia --only 11 --verify

// npx hardhat verify --network base_sepolia 0xdBB66Eb9f4D737B49aE5CD4De25E6C8da8B034f9
// npx hardhat verify --network base_sepolia 0x04AcA9D9944CbEBF42297B307cb2E97bc51a35a9 0xdBB66Eb9f4D737B49aE5CD4De25E6C8da8B034f9

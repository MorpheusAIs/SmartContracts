import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { ERC20Mock__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

module.exports = async function (deployer: Deployer) {
  const token = await deployer.deploy(ERC20Mock__factory, ['Tether USD', 'USDT', 6]);
  await token.mint((await deployer.getSigner()).getAddress(), wei(10000, 6));

  Reporter.reportContracts(['ERC20Mock', await token.getAddress()]);
};

// npx hardhat migrate --path-to-migrations ./deploy/mock --only 1
// npx hardhat migrate --path-to-migrations ./deploy/mock --network sepolia --only 1 --verify

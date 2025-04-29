import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { ERC1967Proxy__factory, FeeConfig__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const config = {
  feeTreasury: '0x19ec1E4b714990620edf41fE28e9a1552953a7F4',
  baseFee: wei(0.0325, 25),
};

module.exports = async function (deployer: Deployer) {
  const impl = await deployer.deploy(FeeConfig__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x']);
  const feeConfig = await deployer.deployed(FeeConfig__factory, await proxy.getAddress());

  await feeConfig.FeeConfig_init(config.feeTreasury, config.baseFee);

  Reporter.reportContracts(['FeeConfig', await feeConfig.getAddress()]);
};

// npx hardhat migrate --path-to-migrations ./deploy/fee-config --network base_sepolia --only 1 --verify

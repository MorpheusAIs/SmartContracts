import { Bridge__factory } from '@/generated-types/ethers';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  const wStEth = config.swapAddresses!.wStEth;

  const bridge = await deployer.deploy(Bridge__factory, ['0x4c7708168395aea569453fc36862d2ffcdac588c', wStEth]);

  Reporter.reportContracts(['bridge', bridge.address]);
};

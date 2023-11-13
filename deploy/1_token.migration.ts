import {
  Distribution__factory,
  ERC1967Proxy__factory,
  ERC20Mock__factory,
  MOR__factory,
} from '@/generated-types/ethers';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  const distributionImpl = await deployer.deploy(Distribution__factory);

  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [await distributionImpl.getAddress(), '0x']);

  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const MOR = await deployer.deploy(MOR__factory, [await distribution.getAddress(), config.cap]);
  const ERC20Mock = await deployer.deploy(ERC20Mock__factory);

  await distribution.Distribution_init(await MOR.getAddress(), ERC20Mock.getAddress(), config.pools || []);

  if (config.pools) {
    for (let i = 0; i < config.pools.length; i++) {
      const pool = config.pools[i];

      if (pool.whitelistedUsers && pool.whitelistedUsers.length > 0) {
        const amounts = pool.amounts!;
        await distribution.manageUsersInPrivatePool(i, pool.whitelistedUsers, amounts);
      }
    }
  }

  Reporter.reportContracts(
    ['MOR', MOR.address],
    ['ERC20', ERC20Mock.address],
    ['Distribution', await distribution.getAddress()]
  );
};

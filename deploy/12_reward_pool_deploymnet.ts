import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { ERC1967Proxy__factory, RewardPool__factory } from '@/generated-types/ethers';
import { getRealRewardsPools } from '@/test/helpers/distribution-helper';

module.exports = async function (deployer: Deployer) {
  const impl = await deployer.deploy(RewardPool__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: 'RewardPool',
  });
  const contract = await deployer.deployed(RewardPool__factory, await proxy.getAddress());
  await contract.RewardPool_init(getRealRewardsPools());

  Reporter.reportContracts(['RewardPool', await contract.getAddress()]);
};

// npx hardhat migrate --network base_sepolia --only 12 --verify

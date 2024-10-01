import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { encodeBytes32String } from 'ethers';

import {
  BuildersTreasury__factory,
  Builders__factory,
  ERC1967Proxy__factory,
  FeeConfig__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { oneHour } from '@/test/helpers/distribution-helper';

const MOR = '0x34a285A1B1C166420Df5b6630132542923B5b27E';
const editPoolDeadline = oneHour;
const minimalWithdrawLockPeriod = oneHour * 0.5;

const feeTreasury = '0x901F2d23823730fb7F2356920e0E273EFdCdFe17';
const baseFee = wei(0.01, 25); // 1%
const feeForWithdraw = wei(0.01, 25); // 1%
const feeForClaim = wei(0.02, 25); // 2%
const withdrawOperation = encodeBytes32String('withdraw');
const claimOperation = encodeBytes32String('claim');

module.exports = async function (deployer: Deployer) {
  const buildersImpl = await deployer.deploy(Builders__factory);
  const buildersProxy = await deployer.deploy(ERC1967Proxy__factory, [await buildersImpl.getAddress(), '0x'], {
    name: 'BuildersProxy',
  });
  const builders = await deployer.deployed(Builders__factory, await buildersProxy.getAddress());

  const buildersTreasuryImpl = await deployer.deploy(BuildersTreasury__factory);
  const buildersTreasuryProxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await buildersTreasuryImpl.getAddress(), '0x'],
    {
      name: 'BuildersTreasuryProxy',
    },
  );
  const buildersTreasury = await deployer.deployed(BuildersTreasury__factory, await buildersTreasuryProxy.getAddress());

  const feeConfigImpl = await deployer.deploy(FeeConfig__factory);
  const feeConfigProxy = await deployer.deploy(ERC1967Proxy__factory, [await feeConfigImpl.getAddress(), '0x'], {
    name: 'FeeConfigProxy',
  });
  const feeConfig = await deployer.deployed(FeeConfig__factory, await feeConfigProxy.getAddress());

  await feeConfig.FeeConfig_init(feeTreasury, baseFee);
  await feeConfig.setFeeForOperation(builders, withdrawOperation, feeForWithdraw);
  await feeConfig.setFeeForOperation(builders, claimOperation, feeForClaim);

  await buildersTreasury.BuildersTreasury_init(MOR, builders);

  await builders.Builders_init(MOR, feeConfig, buildersTreasury, editPoolDeadline, minimalWithdrawLockPeriod);

  Reporter.reportContracts(
    ['Builders', await builders.getAddress()],
    ['BuildersTreasury', await buildersTreasury.getAddress()],
    ['FeeConfig', await feeConfig.getAddress()],
    ['FeeTreasury', feeTreasury],
  );
};

// npx hardhat migrate --network localhost --only 8
// npx hardhat migrate --network arbitrum --only 8 --verify
// npx hardhat migrate --network arbitrum_sepolia --only 8 --verify

import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { encodeBytes32String } from 'ethers';

import {
  BuildersTreasury__factory,
  Builders__factory,
  ERC1967Proxy__factory,
  FeeConfig__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

const feeOperations = {
  withdraw: encodeBytes32String('withdraw'),
  claim: encodeBytes32String('claim'),
};

const arbitrumConfig = {
  mor: '0x092baadb7def4c3981454dd9c0a0d7ff07bcfc86',
  feeTreasury: '0x68700f67Eb19722f8051f072264E979ae4c03c3F',
  baseFee: wei(0.01, 25),
  feeForWithdraw: wei(0.01, 25),
  feeForClaim: wei(0.01, 25),
  editPoolDeadline: 86400,
  minimalWithdrawLockPeriod: 604800,
};

const baseConfig = {
  mor: '0x7431ada8a591c955a994a21710752ef9b882b8e3',
  feeTreasury: '0x68700f67Eb19722f8051f072264E979ae4c03c3F',
  baseFee: wei(0.01, 25),
  feeForWithdraw: wei(0.01, 25),
  feeForClaim: wei(0.01, 25),
  editPoolDeadline: 86400,
  minimalWithdrawLockPeriod: 604800,
};

module.exports = async function (deployer: Deployer) {
  const config = baseConfig;

  const buildersImpl = await deployer.deploy(Builders__factory);
  const buildersProxy = await deployer.deploy(ERC1967Proxy__factory, [await buildersImpl.getAddress(), '0x'], {
    name: 'Builders',
  });
  const builders = await deployer.deployed(Builders__factory, await buildersProxy.getAddress());

  const treasuryImpl = await deployer.deploy(BuildersTreasury__factory);
  const treasuryProxy = await deployer.deploy(ERC1967Proxy__factory, [await treasuryImpl.getAddress(), '0x'], {
    name: 'BuildersTreasury',
  });
  const treasury = await deployer.deployed(BuildersTreasury__factory, await treasuryProxy.getAddress());

  const feeConfigImpl = await deployer.deploy(FeeConfig__factory);
  const feeConfigProxy = await deployer.deploy(ERC1967Proxy__factory, [await feeConfigImpl.getAddress(), '0x'], {
    name: 'FeeConfig',
  });
  const feeConfig = await deployer.deployed(FeeConfig__factory, await feeConfigProxy.getAddress());

  await feeConfig.FeeConfig_init(config.feeTreasury, config.baseFee);
  await feeConfig.setFeeForOperation(builders, feeOperations.withdraw, config.feeForWithdraw);
  await feeConfig.setFeeForOperation(builders, feeOperations.claim, config.feeForClaim);

  await treasury.BuildersTreasury_init(config.mor, builders);

  await builders.Builders_init(
    config.mor,
    feeConfig,
    treasury,
    config.editPoolDeadline,
    config.minimalWithdrawLockPeriod,
  );

  // const newOwner = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

  // const builders = await deployer.deployed(Builders__factory, '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9');
  // await builders.transferOwnership(newOwner);

  // const buildersTreasury = await deployer.deployed(
  //   BuildersTreasury__factory,
  //   '0x9eba628581896ce086cb8f1A513ea6097A8FC561',
  // );
  // await buildersTreasury.transferOwnership(newOwner);

  // const feeConfig = await deployer.deployed(FeeConfig__factory, '0x845FBB4B3e2207BF03087b8B94D2430AB11088eE');
  // await feeConfig.transferOwnership(newOwner);

  Reporter.reportContracts(
    ['Builders', await builders.getAddress()],
    ['BuildersTreasury', await treasury.getAddress()],
    ['FeeConfig', await feeConfig.getAddress()],
  );
};

// npx hardhat migrate --only 8
// npx hardhat migrate --network localhost --only 8
// npx hardhat migrate --network arbitrum --only 8 --verify
// npx hardhat migrate --network arbitrum_sepolia --only 8 --verify
// npx hardhat migrate --network base --only 8 --verify

// npx hardhat migrate --network base --only 8 --continue --verify

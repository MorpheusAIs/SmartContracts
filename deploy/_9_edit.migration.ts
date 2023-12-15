import { Distribution__factory, IDistribution } from '@/generated-types/ethers';
import { SECONDS_IN_DAY } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Deployer } from '@solarity/hardhat-migrate';

module.exports = async function (deployer: Deployer) {
  const distribution = Distribution__factory.connect(
    '0x850A65DA677264bbb7536f8446336C022eCc85Dc',
    await deployer.getSigner(),
  );

  console.log(await distribution.investToken());

  const newPoolParams: IDistribution.PoolStruct = {
    payoutStart: 1702499135,
    withdrawLockPeriod: 120,
    claimLockPeriod: 60,
    decreaseInterval: SECONDS_IN_DAY,
    initialReward: wei(14400),
    rewardDecrease: wei(2.468994701),
    minimalStake: wei(0.001),
    isPublic: true,
  };

  await distribution.editPool(0, newPoolParams);
};

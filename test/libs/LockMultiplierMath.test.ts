import { expect } from 'chai';
import { ethers } from 'hardhat';

import { oneDay } from '../helpers/distribution-helper';

import { BuildersV2 } from '@/generated-types/ethers';
import { PRECISION } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('LockMultiplierMath', () => {
  const maximalMultiplier = wei(10.7, 25);

  const periodStart_ = 1721908800; // Thu, 25 Jul 2024 12:00:00 UTC
  const periodEnd_ = 2211192000; // Thu, 26 Jan 2040 12:00:00 UTC

  const reverter = new Reverter();

  let builders: BuildersV2;

  before(async () => {
    const [lib2Factory] = await Promise.all([ethers.getContractFactory('LockMultiplierMath')]);
    const [lib2] = await Promise.all([await lib2Factory.deploy()]);

    const buildersFactory = await ethers.getContractFactory('BuildersV2', {
      libraries: {
        LockMultiplierMath: await lib2.getAddress(),
      },
    });

    builders = await buildersFactory.deploy();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('#getLockPeriodMultiplier', () => {
    it('should return correct value', async () => {
      expect(await builders.getLockPeriodMultiplier(periodStart_ + oneDay * 100, periodStart_ + oneDay * 400)).to.eq(
        '17449468839567396430000000',
      );
    });
    it('should return minimum 1', async () => {
      expect(await builders.getLockPeriodMultiplier(periodStart_, periodStart_ + 2)).to.eq(PRECISION);
    });
    it('should return maximum 10.7', async () => {
      expect(await builders.getLockPeriodMultiplier(0, periodEnd_ + 1)).to.eq(maximalMultiplier);
    });
    it('should return 1 if start >= end', async () => {
      expect(await builders.getLockPeriodMultiplier(10, 5)).to.eq(PRECISION);
    });
  });
});

// npx hardhat test "test/libs/LockMultiplierMath.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/libs/LockMultiplierMath.test.ts"

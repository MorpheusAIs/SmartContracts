import { assert, expect } from 'chai';
import { BigNumberish, MaxUint256 } from 'ethers';
import { ethers } from 'hardhat';

import { LogExpMathMock } from '@/generated-types/ethers';
import { solidityExp, solidityLn, solidityLog, solidityPow } from '@/scripts/utils/log-exp-math';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('LogExpMath', () => {
  const reverter = new Reverter();

  let math: LogExpMathMock;

  before(async () => {
    const [mathFactory] = await Promise.all([ethers.getContractFactory('LogExpMathMock')]);
    math = await mathFactory.deploy();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('functionality', () => {
    async function testPow(a: BigNumberish, b: BigNumberish) {
      const r1 = await math.pow(a, b);
      const r2 = solidityPow(a, b);

      assert.equal(r1, r2);
    }

    async function testPowEpsilon(a: number, b: number) {
      const contractPow = await math.pow(wei(a), wei(b));

      const backendPow = wei(Math.pow(a, b));

      expect(contractPow).closeTo(backendPow, wei(0.000001));
    }

    async function testExp(a: BigNumberish) {
      const r1 = await math.exp(a);
      const r2 = solidityExp(a);

      assert.equal(r1, r2);
    }

    async function testLog(arg: BigNumberish, base: BigNumberish) {
      const r1 = await math.log(arg, base);
      const r2 = solidityLog(arg, base);

      assert.equal(r1, r2);
    }

    async function testLn(a: BigNumberish) {
      const r1 = await math.ln(a);
      const r2 = solidityLn(a);

      assert.equal(r1, r2);
    }

    describe('pow', () => {
      it('pow', async () => {
        await testPow(0, 1);
        await testPow(wei(1), wei(1));
        await testPow(wei(2), wei(0.5));
        await testPow(261951731874906267618555344999021733924457198851775325773392067866700000n, 54354644323235435n);

        await testPowEpsilon(2, 0.5);

        for (let i = 1000; i <= 10000; i += 1000) {
          await testPowEpsilon(i, 0.5);
        }

        for (let i = 0.1; i < 1; i += 0.1) {
          await testPowEpsilon(10000, i);
        }
      });

      it('zero exponent should revert', async () => {
        await expect(math.pow(1, 0)).to.be.revertedWith('LogExpMath: Zero exponent');
      });

      it('reverts on x, y or result too big', async () => {
        await expect(math.pow(MaxUint256, 1)).to.be.revertedWith('LogExpMath: X out of bounds');
        await expect(math.pow(wei(2), MaxUint256)).to.be.revertedWith('LogExpMath: Y out of bounds');
        await expect(math.pow(wei(2), wei(188))).to.be.revertedWith('LogExpMath: Product out of bounds');
      });
    });

    describe('exp', () => {
      it('exp', async () => {
        await testExp(12345);
        await testExp(wei(2));
        await testExp(wei(-1));
        await testExp(wei(-1));
        await testExp(wei(123));
        await testExp(wei(129));
      });

      it('should revert', async () => {
        await expect(
          math.exp(-261951731874906267618555344999021733924457198851775325773392067866700000n),
        ).to.be.revertedWith('LogExpMath: Invalid exponent');
        await expect(
          math.exp(261951731874906267618555344999021733924457198851775325773392067866700000n),
        ).to.be.revertedWith('LogExpMath: Invalid exponent');
      });
    });

    describe('log', () => {
      it('log', async () => {
        await testLog(1000000000000012345n, 1000000000000012345n);
        await testLog(
          261951731874906267618555344999021733924457198851775325773392067866700000n,
          261951731874906267618555344999021733924457198851775325773392067866700000n,
        );
        await testLog(1879528, 1879528);
      });
    });

    describe('ln', () => {
      it('ln', async () => {
        await testLn(1000000000000012345n);
        await testLn(261951731874906267618555344999021733924457198851775325773392067866700000n);
        await testLn(3887708405994595092220000000000000000000000000000000000000000000000000000000n);
        await testLn(1879528n);
      });

      it('should revert', async () => {
        await expect(math.ln(0)).to.be.revertedWith('LogExpMath: Out of bounds');
      });
    });
  });
});

// npx hardhat test "test/libs/LogExpMath.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/libs/LogExpMath.test.ts"

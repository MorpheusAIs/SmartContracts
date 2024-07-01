import { BigNumberish } from 'ethers';

const ZERO = 0n;
const ONE_17 = 100000000000000000n;
const ONE_18 = 1000000000000000000n;
const ONE_20 = 100000000000000000000n;
const ONE_36 = 1000000000000000000000000000000000000n;

const MAX_NATURAL_EXPONENT = ONE_18 * 130n;
const MIN_NATURAL_EXPONENT = ONE_18 * -41n;

const LN_36_LOWER_BOUND = ONE_18 - ONE_17;
const LN_36_UPPER_BOUND = ONE_18 + ONE_17;

const x0 = 128000000000000000000n; // 2ˆ7
const a0 = 38877084059945950922200000000000000000000000000000000000n; // eˆ(x0) (no decimals)
const x1 = 64000000000000000000n; // 2ˆ6
const a1 = 6235149080811616882910000000n; // eˆ(x1) (no decimals)

const x2 = 3200000000000000000000n; // 2ˆ5
const a2 = 7896296018268069516100000000000000n; // eˆ(x2)
const x3 = 1600000000000000000000n; // 2ˆ4
const a3 = 888611052050787263676000000n; // eˆ(x3)
const x4 = 800000000000000000000n; // 2ˆ3
const a4 = 298095798704172827474000n; // eˆ(x4)
const x5 = 400000000000000000000n; // 2ˆ2
const a5 = 5459815003314423907810n; // eˆ(x5)
const x6 = 200000000000000000000n; // 2ˆ1
const a6 = 738905609893065022723n; // eˆ(x6)
const x7 = 100000000000000000000n; // 2ˆ0
const a7 = 271828182845904523536n; // eˆ(x7)
const x8 = 50000000000000000000n; // 2ˆ-1
const a8 = 164872127070012814685n; // eˆ(x8)
const x9 = 25000000000000000000n; // 2ˆ-2
const a9 = 128402541668774148407n; // eˆ(x9)
const x10 = 12500000000000000000n; // 2ˆ-3
const a10 = 113314845306682631683n; // eˆ(x10)
const x11 = 6250000000000000000n; // 2ˆ-4
const a11 = 106449445891785942956n; // eˆ(x11)

function solidityPow(x: BigNumberish, y: BigNumberish): bigint {
  x = BigInt(x);
  y = BigInt(y);

  if (y === ZERO) {
    throw new Error('Exponent cannot be zero.');
  }

  if (x === ZERO) {
    return ZERO;
  }

  let logx_times_y;

  if (LN_36_LOWER_BOUND < x && x < LN_36_UPPER_BOUND) {
    const ln_36_x = _ln_36(x);
    logx_times_y = (ln_36_x / ONE_18) * y + ((_ln_36(x) % ONE_18) * y) / ONE_18;
  } else {
    logx_times_y = _ln(x) * y;
  }

  logx_times_y = logx_times_y / ONE_18;

  return solidityExp(logx_times_y);
}

function solidityExp(x: BigNumberish): bigint {
  x = BigInt(x);

  if (x < MIN_NATURAL_EXPONENT || x > MAX_NATURAL_EXPONENT) {
    throw new Error('Exponent out of range.');
  }
  if (x < ZERO) {
    return (ONE_18 * ONE_18) / solidityExp(ZERO - x);
  }

  let firstAN;

  if (x >= x0) {
    x -= x0;
    firstAN = a0;
  } else if (x >= x1) {
    x -= x1;
    firstAN = a1;
  } else {
    firstAN = 1n; // One with no decimal places
  }

  x *= 100n;

  let product = ONE_20;

  if (x >= x2) {
    x -= x2;
    product = (product * a2) / ONE_20;
  }
  if (x >= x3) {
    x -= x3;
    product = (product * a3) / ONE_20;
  }
  if (x >= x4) {
    x -= x4;
    product = (product * a4) / ONE_20;
  }
  if (x >= x5) {
    x -= x5;
    product = (product * a5) / ONE_20;
  }
  if (x >= x6) {
    x -= x6;
    product = (product * a6) / ONE_20;
  }
  if (x >= x7) {
    x -= x7;
    product = (product * a7) / ONE_20;
  }
  if (x >= x8) {
    x -= x8;
    product = (product * a8) / ONE_20;
  }
  if (x >= x9) {
    x -= x9;
    product = (product * a9) / ONE_20;
  }

  let seriesSum = ONE_20; // The initial one in the sum, with 20 decimal places.
  let term; // Each term in the sum, where the nth term is (x^n / n!).

  term = x;
  seriesSum += term;

  term = (term * x) / ONE_20 / 2n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 3n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 4n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 5n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 6n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 7n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 8n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 9n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 10n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 11n;
  seriesSum += term;

  term = (term * x) / ONE_20 / 12n;
  seriesSum += term;

  return (((product * seriesSum) / ONE_20) * firstAN) / 100n;
}

function solidityLog(arg: BigNumberish, base: BigNumberish): bigint {
  arg = BigInt(arg);
  base = BigInt(base);

  let logBase;

  if (LN_36_LOWER_BOUND < base && base < LN_36_UPPER_BOUND) {
    logBase = _ln_36(base);
  } else {
    logBase = _ln(base) * ONE_18;
  }

  let logArg;

  if (LN_36_LOWER_BOUND < arg && arg < LN_36_UPPER_BOUND) {
    logArg = _ln_36(base);
  } else {
    logArg = _ln(base) * ONE_18;
  }

  return (logArg * ONE_18) / logBase;
}

function solidityLn(a: BigNumberish): bigint {
  a = BigInt(a);

  if (a <= ZERO) {
    throw new Error('Argument must be greater than zero.');
  }

  if (LN_36_LOWER_BOUND < a && a < LN_36_UPPER_BOUND) {
    return _ln_36(a) / ONE_18;
  } else {
    return _ln(a);
  }
}

function _ln(a: bigint): bigint {
  if (a < ONE_18) {
    return ZERO - _ln((ONE_18 * ONE_18) / a);
  }

  let sum = ZERO;

  if (a >= a0 * ONE_18) {
    a /= a0; // Integer, not fixed point division
    sum += x0;
  }

  if (a >= a1 * ONE_18) {
    a /= a1; // Integer, not fixed point division
    sum += x1;
  }

  sum *= 100n;
  a *= 100n;

  if (a >= a2) {
    a = (a * ONE_20) / a2;
    sum += x2;
  }

  if (a >= a3) {
    a = (a * ONE_20) / a3;
    sum += x3;
  }

  if (a >= a4) {
    a = (a * ONE_20) / a4;
    sum += x4;
  }

  if (a >= a5) {
    a = (a * ONE_20) / a5;
    sum += x5;
  }

  if (a >= a6) {
    a = (a * ONE_20) / a6;
    sum += x6;
  }

  if (a >= a7) {
    a = (a * ONE_20) / a7;
    sum += x7;
  }

  if (a >= a8) {
    a = (a * ONE_20) / a8;
    sum += x8;
  }

  if (a >= a9) {
    a = (a * ONE_20) / a9;
    sum += x9;
  }

  if (a >= a10) {
    a = (a * ONE_20) / a10;
    sum += x10;
  }

  if (a >= a11) {
    a = (a * ONE_20) / a11;
    sum += x11;
  }

  const z = ((a - ONE_20) * ONE_20) / (a + ONE_20);
  const z_squared = (z * z) / ONE_20;

  let num = z;

  let seriesSum = num;

  num = (num * z_squared) / ONE_20;
  seriesSum += num / 3n;

  num = (num * z_squared) / ONE_20;
  seriesSum += num / 5n;

  num = (num * z_squared) / ONE_20;
  seriesSum += num / 7n;

  num = (num * z_squared) / ONE_20;
  seriesSum += num / 9n;

  num = (num * z_squared) / ONE_20;
  seriesSum += num / 11n;

  seriesSum *= 2n;

  return (sum + seriesSum) / 100n;
}

function _ln_36(a: bigint): bigint {
  a *= ONE_18;

  const z = ((a - ONE_36) * ONE_36) / (a + ONE_36);
  const z_squared = (z * z) / ONE_36;

  let num = z;

  let seriesSum = num;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 3n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 5n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 7n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 9n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 11n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 13n;

  num = (num * z_squared) / ONE_36;
  seriesSum += num / 15n;

  return seriesSum * 2n;
}

export { solidityExp, solidityLn, solidityLog, solidityPow };

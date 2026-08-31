import { Options } from '@layerzerolabs/lz-v2-utilities';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  DepositPoolV8__factory,
  DistributorV3__factory,
  L1SenderV3__factory,
  LockMultiplierMath__factory,
  ReferrerLib__factory,
} from '@/generated-types/ethers';

// TO BE RUN WITH: --network ethereum

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';
const distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';

const depositPoolStETHAddress = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
const depositPoolWETHAddress = '0x9380d72aBbD6e0Cc45095A2Ef8c2CA87d77Cb384';
const depositPoolWBTCAddress = '0xdE283F8309Fd1AA46c95d299f6B8310716277A42';
const depositPoolUSDCAddress = '0x6cCE082851Add4c535352f596662521B4De4750E';
const depositPoolUSDTAddress = '0x3B51989212BEdaB926794D6bf8e9E991218cf116';
const depositPoolAddresses = [
  depositPoolStETHAddress,
  depositPoolWETHAddress,
  depositPoolWBTCAddress,
  depositPoolUSDCAddress,
  depositPoolUSDTAddress,
];

// `DepositPoolV8`'s external libraries didn't change in this upgrade -- reuse the already-deployed,
// already-verified instances instead of deploying (and having to verify) new ones.
const referrerLibAddress = '0x9A397c638bD9611539e7992B32E206102e6d2965';
const lockMultiplierMathAddress = '0x345B8B23c38F70f1d77560C60493Bb583f012Cb0';

// LayerZero V2 `EndpointV2`, same address on (almost) every EVM chain.
// https://docs.layerzero.network/v2/deployments/deployed-contracts -- RE-VERIFY before running for real.
const lzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fE728c';

// `chainId_` everywhere below is the real EVM chain id -- `L1SenderV3` resolves it to the LZ eid
// internally via `lzV2Configs[chainId_].eid`, callers (including this script) never pass an eid
// directly.
const arbitrumChainId = 42161;
const baseChainId = 8453;

const arbitrumEid = 30110;
const baseEid = 30184;

// Filled in from the `Reporter.reportContracts` output of `1_arbitrum_phase_1.ts` / `2_base.ts`
// (both files' `_step1`, the deploy step -- that's all this needs, the address is known as soon as
// the receiver is deployed).
// TODO: placeholder values for fork dry-runs (non-zero so `setLzV2Config`'s `receiver != bytes32(0)`
// check passes) -- REPLACE with the real deployed addresses before running for real; `_step2` refuses
// to run while either is still this placeholder.
const PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000001';
const arbitrumReceiverAddress = PLACEHOLDER_ADDRESS;
const baseReceiverAddress = PLACEHOLDER_ADDRESS;

// Generous fixed gas for `L2MessageReceiverV2._lzReceive` (abi.decode + one `IMOROFT.mint` call +
// one event -- cheap, well under 100k gas in practice) with headroom for gas-price/opcode-cost
// drift on the destination chain. No native value is dropped to the receiver (it doesn't need any
// -- it never pays out ETH itself).
const lzReceiveGasLimit = 300_000n;
const lzReceiveOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveGasLimit).toHex();

let l1SenderV3ImplAddress = '';
let distributorV3ImplAddress = '';
let depositPoolV8ImplAddress = '';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DEPLOYER
  // Deploy the new implementations (does not affect anything live).
  await _step1(deployer);

  // TO BE CALLED BY MS
  // Upgrade the existing proxies and configure `L1SenderV3`.
  //
  // ORDER MATTERS: `DistributorV3.sendMintMessage` unconditionally calls `L1Sender`'s 4-arg
  // `sendMintMessage(user,amount,refundTo,chainId)`, which only exists on `L1SenderV3` -- and
  // `DepositPoolV8` unconditionally calls `Distributor`'s 5-arg `sendMintMessage`, which only
  // exists on `DistributorV3`. Upgrading out of order would make `claim()` revert for whichever
  // contract gets upgraded first, until the one it calls into catches up. So: L1Sender, then
  // Distributor, then the DepositPools (order among the 5 pools doesn't matter).
  await _step2(deployer);
};

const _step1 = async (deployer: Deployer) => {
  const referrerLib = await deployer.deployed(ReferrerLib__factory, referrerLibAddress);
  const lockMultiplierMath = await deployer.deployed(LockMultiplierMath__factory, lockMultiplierMathAddress);

  l1SenderV3ImplAddress = await (await deployer.deploy(L1SenderV3__factory)).getAddress();
  distributorV3ImplAddress = await (await deployer.deploy(DistributorV3__factory)).getAddress();
  depositPoolV8ImplAddress = await (
    await deployer.deploy(DepositPoolV8__factory, {
      libraries: {
        ReferrerLib: await referrerLib.getAddress(),
        LockMultiplierMath: await lockMultiplierMath.getAddress(),
      },
    })
  ).getAddress();

  Reporter.reportContracts(
    ['L1SenderV3 impl', l1SenderV3ImplAddress],
    ['DistributorV3 impl', distributorV3ImplAddress],
    ['DepositPoolV8 impl', depositPoolV8ImplAddress],
  );
};

const _step2 = async (deployer: Deployer) => {
  if (
    !arbitrumReceiverAddress ||
    !baseReceiverAddress ||
    arbitrumReceiverAddress.toLowerCase() === PLACEHOLDER_ADDRESS ||
    baseReceiverAddress.toLowerCase() === PLACEHOLDER_ADDRESS
  ) {
    throw new Error('Set `arbitrumReceiverAddress` / `baseReceiverAddress` from steps 1 and 2 first.');
  }

  const ms = await ethers.getImpersonatedSigner(msAddress);

  // 1. L1Sender: upgrade, then configure the new LayerZero V2 channel.
  const l1Sender = await deployer.deployed(L1SenderV3__factory, l1SenderAddress);
  await l1Sender.connect(ms).upgradeTo(l1SenderV3ImplAddress);

  await l1Sender.connect(ms).setLzEndpointV2(lzEndpointV2Address);
  await l1Sender.connect(ms).setLzDelegate(msAddress);
  // `setLzV2Config` for `arbitrumChainId` MUST run before `setDefaultChainId(arbitrumChainId)` --
  // the latter now requires a config to already exist for the chain id it's pointed at.
  await l1Sender.connect(ms).setLzV2Config(arbitrumChainId, {
    eid: arbitrumEid,
    receiver: ethers.zeroPadValue(arbitrumReceiverAddress, 32),
    options: lzReceiveOptions,
  });
  await l1Sender.connect(ms).setLzV2Config(baseChainId, {
    eid: baseEid,
    receiver: ethers.zeroPadValue(baseReceiverAddress, 32),
    options: lzReceiveOptions,
  });
  await l1Sender.connect(ms).setDefaultChainId(arbitrumChainId); // Arbitrum stays the default network.

  // 2. Distributor: upgrade.
  const distributor = await deployer.deployed(DistributorV3__factory, distributorAddress);
  await distributor.connect(ms).upgradeTo(distributorV3ImplAddress);

  // 3. DepositPools: upgrade (all 5 share the same implementation instance).
  for (const depositPoolAddress of depositPoolAddresses) {
    const depositPool = await deployer.deployed(DepositPoolV8__factory, depositPoolAddress);
    await depositPool.connect(ms).upgradeTo(depositPoolV8ImplAddress);
  }
};

// Before running `4_arbitrum_phase_2.ts`: do a real, small claim with an explicit destination
// chain id on both Arbitrum (`chainId_ = 42161`, or omit -- it's now the default) and Base
// (`chainId_ = 8453`) and confirm MOR actually lands on each L2. Reverts here are safe (no funds
// move on a revert) -- but don't remove the old Arbitrum minter until this has actually been seen
// to work end-to-end.

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 3 --network ethereum
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 3 --network ethereum --verify --continue

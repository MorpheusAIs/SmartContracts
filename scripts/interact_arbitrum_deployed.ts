import { ethers } from 'hardhat';

async function main() {
  console.log('Interacting with deployed contracts on Arbitrum...');

  // Contract addresses from Arbitrum deployment
  const MOR_ADDRESS = '0x36fE2E7a1c19F7Be268272540E9A4aB306686506';
  const BUILDERS_ADDRESS = '0xEA02B7528F2f07B0F6Eb485C56d182B311B80284';
  const TREASURY_ADDRESS = '0xc9ca372CF893659821a7F803A295638769377906';
  const FEE_CONFIG_ADDRESS = '0x891d0746D312a42D08FDF6688422D543C86b54Fa';

  const [deployer] = await ethers.getSigners();
  console.log('Using account:', deployer.address);

  // Get contract instances
  const mor = await ethers.getContractAt('MOR', MOR_ADDRESS);
  const builders = await ethers.getContractAt('Builders', BUILDERS_ADDRESS);

  // Check MOR token details
  console.log('\n=== MOR Token Info ===');
  console.log('Name:', await mor.name());
  console.log('Symbol:', await mor.symbol());
  console.log('Total Supply:', ethers.formatEther(await mor.totalSupply()));
  console.log('Cap:', ethers.formatEther(await mor.cap()));
  console.log('Deployer Balance:', ethers.formatEther(await mor.balanceOf(deployer.address)));

  // Check Builders contract info
  console.log('\n=== Builders Contract Info ===');
  console.log('Deposit Token:', await builders.depositToken());
  console.log('Fee Config:', await builders.feeConfig());
  console.log('Treasury:', await builders.buildersTreasury());
  console.log('Edit Pool Deadline:', await builders.editPoolDeadline());
  console.log('Minimal Withdraw Lock Period:', await builders.minimalWithdrawLockPeriod());

  // Test creating a builder pool
  console.log('\n=== Testing Builder Pool Creation ===');
  const poolName = 'Test Builder Pool';
  const poolId = await builders.getPoolId(poolName);
  console.log("Pool ID for 'Test Builder Pool':", poolId);

  // Check if pool already exists
  try {
    const existingPool = await builders.builderPools(poolId);
    if (existingPool.admin === '0x0000000000000000000000000000000000000000') {
      console.log("Pool doesn't exist yet - we could create one");
    } else {
      console.log('Pool already exists with admin:', existingPool.admin);
    }
  } catch (error) {
    console.log("Pool doesn't exist yet");
  }

  console.log('\n=== Contract Addresses ===');
  console.log('MOR Token:', MOR_ADDRESS);
  console.log('Builders:', BUILDERS_ADDRESS);
  console.log('Treasury:', TREASURY_ADDRESS);
  console.log('FeeConfig:', FEE_CONFIG_ADDRESS);
  console.log('Network Chain ID: 42161 (Arbitrum)');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

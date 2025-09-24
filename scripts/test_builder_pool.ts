import { ethers } from 'hardhat';

async function main() {
  console.log('Testing Builder Pool functionality...');

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();

  // Select contract addresses based on network
  let MOR_ADDRESS, BUILDERS_ADDRESS;

  if (chainId === '42161') {
    // Arbitrum addresses
    MOR_ADDRESS = '0x36fE2E7a1c19F7Be268272540E9A4aB306686506';
    BUILDERS_ADDRESS = '0xEA02B7528F2f07B0F6Eb485C56d182B311B80284';
    console.log('Testing on Arbitrum (Chain ID: 42161)');
  } else if (chainId === '8453') {
    // Base addresses
    MOR_ADDRESS = '0x7511fAE41153Fad8A569d7Ebdcc76c120D3d5AAb';
    BUILDERS_ADDRESS = '0x17073Da1E92008eAE64cd5D3e8129F7928D3b362';
    console.log('Testing on Base (Chain ID: 8453)');
  } else {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log('Using account:', deployer.address);

  // Get contract instances
  const mor = await ethers.getContractAt('MOR', MOR_ADDRESS);
  const builders = await ethers.getContractAt('Builders', BUILDERS_ADDRESS);

  console.log('\n=== Testing Builder Pool Creation ===');

  // Create a builder pool
  const builderPool = {
    name: 'Test AI Builder Pool',
    admin: deployer.address,
    minimalDeposit: ethers.parseEther('100'), // 100 MOR minimum
    poolStart: Math.floor(Date.now() / 1000) + 3600, // Start in 1 hour
    claimLockEnd: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
    withdrawLockPeriodAfterDeposit: 86400 * 7, // 7 days lock after deposit
  };

  const poolId = await builders.getPoolId(builderPool.name);
  console.log('Pool ID:', poolId);

  try {
    // Check if pool exists
    const existingPool = await builders.builderPools(poolId);
    if (existingPool.admin === '0x0000000000000000000000000000000000000000') {
      console.log('Creating new builder pool...');
      await builders.createBuilderPool(builderPool);
      console.log('✅ Builder pool created successfully!');
    } else {
      console.log('Pool already exists with admin:', existingPool.admin);
    }
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Check pool details
  try {
    const poolDetails = await builders.builderPools(poolId);
    console.log('\n=== Pool Details ===');
    console.log('Name:', poolDetails.name);
    console.log('Admin:', poolDetails.admin);
    console.log('Minimal Deposit:', ethers.formatEther(poolDetails.minimalDeposit), 'MOR');
    console.log('Pool Start:', new Date(Number(poolDetails.poolStart) * 1000).toLocaleString());
    console.log('Claim Lock End:', new Date(Number(poolDetails.claimLockEnd) * 1000).toLocaleString());
  } catch (error) {
    console.log('Could not fetch pool details:', error.message);
  }

  // Check MOR balance and allowance
  console.log('\n=== MOR Token Status ===');
  const balance = await mor.balanceOf(deployer.address);
  console.log('Deployer MOR Balance:', ethers.formatEther(balance));

  const allowance = await mor.allowance(deployer.address, BUILDERS_ADDRESS);
  console.log('Builders Contract Allowance:', ethers.formatEther(allowance));

  // Approve tokens for potential deposits
  if (allowance < ethers.parseEther('1000')) {
    console.log('Approving MOR tokens for Builders contract...');
    await mor.approve(BUILDERS_ADDRESS, ethers.parseEther('10000'));
    console.log('✅ Approval successful!');
  }

  console.log('\n=== Summary ===');
  console.log('Network:', chainId === '42161' ? 'Arbitrum' : 'Base');
  console.log('MOR Token:', MOR_ADDRESS);
  console.log('Builders Contract:', BUILDERS_ADDRESS);
  console.log('Pool ID:', poolId);
  console.log('Ready for deposits and interactions!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

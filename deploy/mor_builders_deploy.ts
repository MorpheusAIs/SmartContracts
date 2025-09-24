import { encodeBytes32String } from 'ethers';
import { ethers } from 'hardhat';

async function main() {
  console.log('Starting MOR and Builders deployment...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');

  const network = await ethers.provider.getNetwork();
  console.log('Network Chain ID:', network.chainId.toString());

  // Deploy MOR token first
  console.log('\n=== Deploying MOR Token ===');
  const MOR = await ethers.getContractFactory('MOR');
  const cap = ethers.parseEther('42000000'); // 42 million tokens
  const mor = await MOR.deploy(cap);
  await mor.waitForDeployment();
  const morAddress = await mor.getAddress();
  console.log('MOR token deployed to:', morAddress);

  // Deploy ERC1967Proxy factory for upgradeable contracts
  const ERC1967Proxy = await ethers.getContractFactory('ERC1967Proxy');

  // Deploy FeeConfig
  console.log('\n=== Deploying FeeConfig ===');
  const FeeConfig = await ethers.getContractFactory('FeeConfig');
  const feeConfigImpl = await FeeConfig.deploy();
  await feeConfigImpl.waitForDeployment();

  const feeConfigProxy = await ERC1967Proxy.deploy(await feeConfigImpl.getAddress(), '0x');
  await feeConfigProxy.waitForDeployment();
  const feeConfig = FeeConfig.attach(await feeConfigProxy.getAddress());
  console.log('FeeConfig deployed to:', await feeConfig.getAddress());

  // Deploy BuildersTreasury
  console.log('\n=== Deploying BuildersTreasury ===');
  const BuildersTreasury = await ethers.getContractFactory('BuildersTreasury');
  const treasuryImpl = await BuildersTreasury.deploy();
  await treasuryImpl.waitForDeployment();

  const treasuryProxy = await ERC1967Proxy.deploy(await treasuryImpl.getAddress(), '0x');
  await treasuryProxy.waitForDeployment();
  const treasury = BuildersTreasury.attach(await treasuryProxy.getAddress());
  console.log('BuildersTreasury deployed to:', await treasury.getAddress());

  // Deploy Builders
  console.log('\n=== Deploying Builders ===');
  const Builders = await ethers.getContractFactory('Builders');
  const buildersImpl = await Builders.deploy();
  await buildersImpl.waitForDeployment();

  const buildersProxy = await ERC1967Proxy.deploy(await buildersImpl.getAddress(), '0x');
  await buildersProxy.waitForDeployment();
  const builders = Builders.attach(await buildersProxy.getAddress());
  console.log('Builders deployed to:', await builders.getAddress());

  // Initialize contracts
  console.log('\n=== Initializing Contracts ===');

  // Configuration values
  const feeTreasury = deployer.address; // Use deployer as fee treasury for testing
  const baseFee = ethers.parseEther('0.01'); // 0.01 ETH base fee
  const feeAmount = ethers.parseEther('0.01'); // 0.01 ETH for operations
  const editPoolDeadline = 86400; // 1 day
  const minimalWithdrawLockPeriod = 604800; // 1 week

  // Initialize FeeConfig
  console.log('Initializing FeeConfig...');
  await feeConfig.FeeConfig_init(feeTreasury, baseFee);

  // Set fees for operations
  const feeOperations = {
    withdraw: encodeBytes32String('withdraw'),
    claim: encodeBytes32String('claim'),
  };

  await feeConfig.setFeeForOperation(await builders.getAddress(), feeOperations.withdraw, feeAmount);
  await feeConfig.setFeeForOperation(await builders.getAddress(), feeOperations.claim, feeAmount);

  // Initialize BuildersTreasury
  console.log('Initializing BuildersTreasury...');
  await treasury.BuildersTreasury_init(morAddress, await builders.getAddress());

  // Initialize Builders
  console.log('Initializing Builders...');
  await builders.Builders_init(
    morAddress,
    await feeConfig.getAddress(),
    await treasury.getAddress(),
    editPoolDeadline,
    minimalWithdrawLockPeriod,
  );

  // Mint some MOR tokens to the deployer and treasury for testing
  console.log('\n=== Minting Test Tokens ===');
  await mor.mint(deployer.address, ethers.parseEther('10000')); // 10k to deployer
  await mor.mint(await treasury.getAddress(), ethers.parseEther('100000')); // 100k to treasury

  const deployerBalance = await mor.balanceOf(deployer.address);
  const treasuryBalance = await mor.balanceOf(await treasury.getAddress());

  console.log('Deployer MOR balance:', ethers.formatEther(deployerBalance));
  console.log('Treasury MOR balance:', ethers.formatEther(treasuryBalance));

  console.log('\n=== Deployment Summary ===');
  console.log('Network Chain ID:', network.chainId.toString());
  console.log('MOR Token:', morAddress);
  console.log('Builders:', await builders.getAddress());
  console.log('BuildersTreasury:', await treasury.getAddress());
  console.log('FeeConfig:', await feeConfig.getAddress());

  return {
    mor: morAddress,
    builders: await builders.getAddress(),
    treasury: await treasury.getAddress(),
    feeConfig: await feeConfig.getAddress(),
    chainId: network.chainId.toString(),
  };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default main;

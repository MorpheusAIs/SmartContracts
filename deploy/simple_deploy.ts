import { ethers } from 'hardhat';

async function main() {
  console.log('Starting simple deployment...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy MOR token with a cap of 42 million tokens (42M * 18 decimals)
  const MOR = await ethers.getContractFactory('MOR');
  const cap = ethers.parseEther('42000000'); // 42 million tokens

  console.log('Deploying MOR token...');
  const mor = await MOR.deploy(cap);
  await mor.waitForDeployment();

  const morAddress = await mor.getAddress();
  console.log('MOR token deployed to:', morAddress);

  // Deploy FeeConfig contract
  const FeeConfig = await ethers.getContractFactory('FeeConfig');
  console.log('Deploying FeeConfig...');
  const feeConfig = await FeeConfig.deploy();
  await feeConfig.waitForDeployment();

  const feeConfigAddress = await feeConfig.getAddress();
  console.log('FeeConfig deployed to:', feeConfigAddress);

  // Mint some tokens to the deployer for testing
  console.log('Minting 1000 MOR tokens to deployer...');
  await mor.mint(deployer.address, ethers.parseEther('1000'));

  const balance = await mor.balanceOf(deployer.address);
  console.log('Deployer MOR balance:', ethers.formatEther(balance));

  console.log('\nDeployment Summary:');
  console.log('===================');
  console.log('MOR Token:', morAddress);
  console.log('FeeConfig:', feeConfigAddress);
  console.log('Network:', await ethers.provider.getNetwork());

  return {
    mor: morAddress,
    feeConfig: feeConfigAddress,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

export default main;

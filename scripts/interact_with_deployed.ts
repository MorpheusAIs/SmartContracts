import { ethers } from 'hardhat';

async function main() {
  console.log('Interacting with deployed contracts on Base...');

  // Contract addresses from Base deployment
  const MOR_ADDRESS = '0x7511fAE41153Fad8A569d7Ebdcc76c120D3d5AAb';
  const BUILDERS_ADDRESS = '0x17073Da1E92008eAE64cd5D3e8129F7928D3b362';
  const TREASURY_ADDRESS = '0xbB57B4A979929EE85a82C2867F95795A6A3020a0';
  const FEE_CONFIG_ADDRESS = '0x14fB3B15bc6046aa94A704EC86Bf795D16d05424';

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

  console.log('\n=== Contract Addresses ===');
  console.log('MOR Token:', MOR_ADDRESS);
  console.log('Builders:', BUILDERS_ADDRESS);
  console.log('Treasury:', TREASURY_ADDRESS);
  console.log('FeeConfig:', FEE_CONFIG_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import { ethers } from 'hardhat';

const PROXY_ADDRESS = '0x2265ae4127a49218c1c562cb16822971f295ed50';
const SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'; // _IMPLEMENTATION_SLOT
// const SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

module.exports = async function () {
  const value = await ethers.provider.getStorage(PROXY_ADDRESS, SLOT);
  console.log('Raw value:', value);

  const addressValue = '0x' + value.slice(-40);
  console.log('Address value:', addressValue);
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 2 --network ethereum

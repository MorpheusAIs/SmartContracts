import { Deployer } from '@solarity/hardhat-migrate';
import { readFileSync } from 'fs';

import { Builders__factory } from '@/generated-types/ethers';

type Subnet = {
  id: string;
  name: string;
  admin: string;
  startsAt: number;
  minimalDeposit: number;
  claimLockEnd: number;
  withdrawLockPeriodAfterDeposit: number;
  totalUsers: number;
  users: string[];
  description: string;
  website: string;
};

// BASE setup
const buildersAddress = '0x42BB446eAE6dca7723a9eBdb81EA88aFe77eF4B9';

module.exports = async function (deployer: Deployer) {
  const contract = await deployer.deployed(Builders__factory, buildersAddress);

  const configPath2 = `deploy/builders-protocol/data/subnets.json`;
  const subnets = JSON.parse(readFileSync(configPath2, 'utf-8')) as Subnet[];

  let totalBuildersVirtualDeposited = 0n;
  let totalBuildersDeposited = 0n;

  let totalUsersVirtualDeposited = 0n;
  let totalUsersDeposited = 0n;

  console.log('');
  console.log(`Subnets count: ${subnets.length}`);

  for (let i = 0; i < subnets.length; i++) {
    const subnet = subnets[i];
    const res = await contract.buildersPoolData(subnet.id);

    const buildersDeposited = res[1];
    const buildersVirtualDeposited = res[2];

    totalBuildersVirtualDeposited += buildersVirtualDeposited;
    totalBuildersDeposited += buildersDeposited;

    // let userSumForBuilderSubnet = 0n;
    // let userSumVirtualForBuilderSubnet = 0n;
    for (let k = 0; k < subnet.users.length; k++) {
      const userAddress = subnet.users[k];
      const userData = await contract.usersData(userAddress, subnet.id);

      const userDeposited = userData[2];
      const userVirtualDeposited = userData[3];
      // userSumForBuilderSubnet += userDeposited;
      // userSumVirtualForBuilderSubnet += userVirtualDeposited;

      totalUsersDeposited += userDeposited;
      totalUsersVirtualDeposited += userVirtualDeposited;
    }

    // if (buildersVirtualDeposited !== userSumVirtualForBuilderSubnet) {
    //   console.log('---- virtual sum');
    //   console.log(i);
    //   console.log(subnet.name);
    //   console.log(buildersVirtualDeposited);
    //   console.log(userSumVirtualForBuilderSubnet);
    // }

    // if (buildersDeposited !== userSumForBuilderSubnet) {
    //   console.log('---- sum');
    //   console.log(i);
    //   console.log(subnet.name);
    //   console.log(buildersDeposited);
    //   console.log(userSumForBuilderSubnet);
    // }
  }

  const totalPoolData = await contract.totalPoolData();
  const totalDeposited = totalPoolData[2];
  const totalVirtualDeposited = totalPoolData[3];

  console.log('');
  console.log(`-----------------------`);
  console.log(`Total Deposited: ${totalDeposited} MOR`);
  console.log(`Total Builders Deposited: ${totalBuildersDeposited} MOR`);
  console.log(`Total Users Deposited: ${totalUsersDeposited} MOR`);
  console.log(`-----------------------`);
  console.log(`Total Virtual Deposited: ${totalVirtualDeposited} MOR`);
  console.log(`Total Builders Virtual Deposited: ${totalBuildersVirtualDeposited} MOR`);
  console.log(`Total Users Virtual Deposited: ${totalUsersVirtualDeposited} MOR`);
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network base --only 1
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network arbitrum --only 1

import * as hre from 'hardhat';

async function main() {
  const [networkL1, networkL2] = ['localhost', 'localhost'];
  const verifyL1 = networkL1 !== 'localhost';
  const verifyL2 = networkL2 !== 'localhost';

  await hre.run('migrate', { network: networkL1, verify: verifyL1, only: 1 });
  await hre.run('migrate', { network: networkL2, verify: verifyL2, only: 2, continue: true });
  await hre.run('migrate', { network: networkL1, verify: verifyL1, only: 3, continue: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/bin/bash
set -e

verifyL1=$([ '$1' = 'localhost' ] && echo --verify || echo '')
verifyL2=$([ '$2' = 'localhost' ] && echo --verify || echo '')

npx hardhat migrate --network $2 --only 1 $verifyL2 $3
npx hardhat migrate --network $1 --only 2 $verifyL1 --continue
npx hardhat migrate --network $2 --only 3 $verifyL2 --continue

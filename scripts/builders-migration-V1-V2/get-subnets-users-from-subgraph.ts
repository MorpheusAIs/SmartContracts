import fs from 'fs';
import fetch from 'node-fetch';

const SUBGRAPH_URL =
  'https://subgraph.satsuma-prod.com/8675f21b07ed/9iqb9f4qcmhosiruyg763--465704/morpheus-mainnet-base/api';

const BUILDERS_USERS = `
  {
    buildersUsers(first: 1000) {
      address
      buildersProject {
        id
      }
    }
  }
`;

type BuilderUser = {
  address: string;
  buildersProject: {
    id: string;
  };
};

type BuilderUsersSubgraphResponse = {
  data: {
    buildersUsers: BuilderUser[];
  };
};

async function callSubgraph(query: string) {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    return response.json();
  } catch (error) {
    console.error('Error on request:', error);
  }
}

async function fetchData() {
  try {
    // Get Builders
    const response = (await callSubgraph(BUILDERS_USERS)) as BuilderUsersSubgraphResponse;
    console.log(response.data.buildersUsers.length);

    // // Add Staker to each Builder
    const data: Array<{ address: string; poolId: string }> = [];
    for (let i = 0; i < response.data.buildersUsers.length; i++) {
      const user = response.data.buildersUsers[i];

      data.push({ address: user.address, poolId: user.buildersProject.id });
    }

    const filename = 'subnets-users.json';
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error on request:', error);
  }
}

fetchData()
  .then(() => {})
  .catch((e) => {
    console.log(`Error: ${e}`);
  });

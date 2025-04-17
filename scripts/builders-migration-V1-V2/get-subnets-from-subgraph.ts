import fs from 'fs';
import fetch from 'node-fetch';

const SUBGRAPH_URL = 'https://subgraph.satsuma-prod.com/45db3de29da6/alexs-team--477165/morpheus-mainnet-base-v2/api';
// const SUBGRAPH_URL =
//   'https://subgraph.satsuma-prod.com/45db3de29da6/alexs-team--477165/morpheus-mainnet-arbitrum-v2/api';

const BUILDERS_QUERY = `
  {
    buildersProjects(first: 999) {
      id
      name
      admin
      startsAt
      minimalDeposit
      withdrawLockPeriodAfterDeposit
      claimLockEnd
      totalUsers
    }
  }
`;

type BuilderProject = {
  id: string;
  name: string;
  admin: string;
  startsAt: number;
  minimalDeposit: number;
  withdrawLockPeriodAfterDeposit: number;
  claimLockEnd: number;
  totalUsers: number;
};

type BuilderUser = {
  address: string;
};

type PredefinedBuilder = {
  name: string;
  description: string;
  website: string;
};

type BuildersProjectsSubgraphResponse = {
  data: {
    buildersProjects: BuilderProject[];
  };
};

type BuilderUsersSubgraphResponse = {
  data: {
    buildersUsers: BuilderUser[];
  };
};

const formBuilderUsersQuery = (builderProjectId: string) => {
  return `
  {
    buildersUsers (first: 1000, where: {buildersProject: "${builderProjectId}"}) {
     address
    }
  }
  `;
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
    const builders = (await callSubgraph(BUILDERS_QUERY)) as BuildersProjectsSubgraphResponse;

    console.log(`Loaded: ${builders.data.buildersProjects.length} entities`);

    // Add Staker to each Builder
    const data: Array<BuilderProject & { users: string[]; description: string; website: string }> = [];
    for (let i = 0; i < builders.data.buildersProjects.length; i++) {
      const builder = builders.data.buildersProjects[i];
      // const query = formBuilderUsersQuery(builder.id);
      // const res = (await callSubgraph(query)) as BuilderUsersSubgraphResponse;

      // if (Number(builder.totalUsers) !== res.data.buildersUsers.length) {
      //   throw Error(
      //     `Builder: ${builder.name}, total users: ${builder.totalUsers}, received users count: ${res.data.buildersUsers.length}`,
      //   );
      // }

      // const users = res.data.buildersUsers.map((buildersUsers) => {
      //   return buildersUsers.address;
      // });
      const users: string[] = [];

      data.push({ ...builder, users, description: '', website: '' });
    }

    // Add metadata
    const fileContent = fs.readFileSync('predefined-builders-meta.json', 'utf-8');
    const predefinedData = JSON.parse(fileContent) as PredefinedBuilder[];
    for (let i = 0; i < data.length; i++) {
      const meta = predefinedData.find((e) => e.name === data[i].name);
      if (meta) {
        data[i].description = meta.description;
        data[i].website = meta.website;
      }
    }

    const filename = 'builders-v1-subnets.json';
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));

    console.log(`Data saved to ${filename}`);
  } catch (error) {
    console.error('Error on request:', error);
  }
}

fetchData()
  .then(() => {})
  .catch((e) => {
    console.log(`Error: ${e}`);
  });

// npx tsx get-subnets-from-subgraph.ts

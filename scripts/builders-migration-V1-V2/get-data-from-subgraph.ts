import fs from 'fs';
import fetch from 'node-fetch';

const SUBGRAPH_URL =
  'https://subgraph.satsuma-prod.com/8675f21b07ed/9iqb9f4qcmhosiruyg763--465704/morpheus-mainnet-base/api';

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
    buildersUsers (where: {buildersProject: "${builderProjectId}"}) {
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

    // Add Staker to each Builder
    const data: Array<BuilderProject & { users: string[]; description: string; website: string }> = [];
    for (let i = 0; i < builders.data.buildersProjects.length; i++) {
      const builder = builders.data.buildersProjects[i];
      const query = formBuilderUsersQuery(builder.id);
      const res = (await callSubgraph(query)) as BuilderUsersSubgraphResponse;

      // if (Number(builder.totalUsers) !== res.data.buildersUsers.length) {
      //   throw Error(
      //     `Builder: ${builder.name}, total users: ${builder.totalUsers}, received users count: ${res.data.buildersUsers.length}`,
      //   );
      // }

      const users = res.data.buildersUsers.map((buildersUsers) => {
        return buildersUsers.address;
      });

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

    const filename = 'subgraph-output.json';
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

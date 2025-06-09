module.exports = {
  skipFiles: ['mock', 'interfaces', '@layerzerolabs', 'old', 'capital-protocol/old', 'builder-protocol/old'],
  skipTests: ['fork'],
  configureYulOptimizer: true,
  measureStatementCoverage: false,
};

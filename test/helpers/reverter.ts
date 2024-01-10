import { network } from 'hardhat';

export class Reverter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private snapshotId: any;

  revert = async () => {
    await network.provider.send('evm_revert', [this.snapshotId]);
    await this.snapshot();
  };

  snapshot = async () => {
    this.snapshotId = await network.provider.send('evm_snapshot', []);
  };
}

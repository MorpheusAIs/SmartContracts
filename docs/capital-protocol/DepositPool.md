# Solidity API

## DepositPool

### DECIMAL

```solidity
uint128 DECIMAL
```

### isNotUpgradeable

```solidity
bool isNotUpgradeable
```

The function to receive the possibility to upgrade the contract.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### depositToken

```solidity
address depositToken
```

_Main stake token for the contract_

### l1Sender

```solidity
address l1Sender
```

_`L1SenderV2` contract address_

### unusedStorage1

```solidity
struct IDepositPool.Pool[] unusedStorage1
```

_Contain information about reward pools. Removed in `DepositPool`,
v6 update, moved to the `RewardPool` contract._

### rewardPoolsData

```solidity
mapping(uint256 => struct IDepositPool.RewardPoolData) rewardPoolsData
```

_Contain internal data about the reward pools, necessary for calculations_

### usersData

```solidity
mapping(address => mapping(uint256 => struct IDepositPool.UserData)) usersData
```

_Contain internal data about the users deposits, necessary for calculations_

### totalDepositedInPublicPools

```solidity
uint256 totalDepositedInPublicPools
```

_Contain total real deposited amount for `depositToken`_

### unusedStorage2

```solidity
mapping(uint256 => struct IDepositPool.RewardPoolLimits) unusedStorage2
```

_UPGRADE. `DistributionV4` storage updates, add pool limits.
Removed in `DepositPool`, v6 update, moved to `rewardPoolsProtocolDetails`_

### referrerTiers

```solidity
mapping(uint256 => struct IReferrer.ReferrerTier[]) referrerTiers
```

_UPGRADE `DistributionV5` storage updates, add referrers._

### referrersData

```solidity
mapping(address => mapping(uint256 => struct IReferrer.ReferrerData)) referrersData
```

### isAddressAllowedToClaim

```solidity
mapping(address => mapping(address => bool)) isAddressAllowedToClaim
```

_UPGRADE `DistributionV6` storage updates, add addresses allowed to claim for `_msgSender()`._

### isMigrationOver

```solidity
bool isMigrationOver
```

_This flag determines whether the migration has been completed._

### distributor

```solidity
address distributor
```

_`Distributor` contract address._

### rewardPoolsProtocolDetails

```solidity
mapping(uint256 => struct IDepositPool.RewardPoolProtocolDetails) rewardPoolsProtocolDetails
```

_Contain information about rewards pools needed for this contract._

### constructor

```solidity
constructor() public
```

_UPGRADE `DepositPool`, v7 end._

### DepositPool_init

```solidity
function DepositPool_init(address depositToken_, address distributor_) external
```

The function to initialize the contract.

_Used by admins, once._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| depositToken_ | address | The address of the deposit token. Users stake this token. |
| distributor_ | address | The `Distributor` contract address. |

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setDistributor

```solidity
function setDistributor(address value_) public
```

The function to set the the `Distributor` contract address.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | address | The `Distributor` contract address. |

### setRewardPoolProtocolDetails

```solidity
function setRewardPoolProtocolDetails(uint256 rewardPoolIndex_, uint128 withdrawLockPeriodAfterStake_, uint128 claimLockPeriodAfterStake_, uint128 claimLockPeriodAfterClaim_, uint256 minimalStake_) public
```

The function to fill the `RewardPoolProtocolDetails` struct.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| withdrawLockPeriodAfterStake_ | uint128 | The period in seconds when the user can't withdraw his stake after the `stake()`. |
| claimLockPeriodAfterStake_ | uint128 | The period in seconds when the user can't claim tokens after the `stake()`. |
| claimLockPeriodAfterClaim_ | uint128 | The period in seconds when the user can't claim tokens after thr `claim()`. |
| minimalStake_ | uint256 | The minimal stake amount that user should have on the contract balance, after the stake or withdraw. |

### migrate

```solidity
function migrate(uint256 rewardPoolIndex_) external
```

The function to migrate contract data to the new version. From V6 to V7.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index for the public reward pool. |

### editReferrerTiers

```solidity
function editReferrerTiers(uint256 rewardPoolIndex_, struct IReferrer.ReferrerTier[] referrerTiers_) external
```

The function to update the referrer tiers.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| referrerTiers_ | struct IReferrer.ReferrerTier[] | The referrers tiers. |

### manageUsersInPrivateRewardPool

```solidity
function manageUsersInPrivateRewardPool(uint256 rewardPoolIndex_, address[] users_, uint256[] amounts_, uint128[] claimLockEnds_, address[] referrers_) external
```

The function to manage users and their stake amount in the private pools.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The private reward poll index. |
| users_ | address[] | The array of users. |
| amounts_ | uint256[] | The array of final staked amount. |
| claimLockEnds_ | uint128[] | The array of claim lock ends. |
| referrers_ | address[] | The array of referrers. |

### setAddressesAllowedToClaim

```solidity
function setAddressesAllowedToClaim(address[] addresses_, bool[] isAllowed_) external
```

The function to set the addresses which can claim instead of `msg.sender`.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addresses_ | address[] | The list with whitelisted addresses. |
| isAllowed_ | bool[] | The list with allowed status (true or false) for the each address in the `addresses_` array. |

### stake

```solidity
function stake(uint256 rewardPoolIndex_, uint256 amount_, uint128 claimLockEnd_, address referrer_) external
```

The function to stake the `depositToken` tokens in the public pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The public reward poll index. |
| amount_ | uint256 | The amount of tokens to stake. |
| claimLockEnd_ | uint128 | The timestamp when the user can claim his rewards. The default value is zero. |
| referrer_ | address | The referrer address. The default value is zero address. |

### withdraw

```solidity
function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external
```

The function to withdraw tokens from the public pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The public reward poll index. |
| amount_ | uint256 | The amount of tokens to withdraw. |

### claim

```solidity
function claim(uint256 poolId_, address receiver_) external payable
```

### claimFor

```solidity
function claimFor(uint256 poolId_, address user_, address receiver_) external payable
```

The function to claim rewards from the pool for the specified staker.

_The caller should be whitelisted with `setAddressesAllowedToClaim()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| user_ | address | Specified address. |
| receiver_ | address | The rewards receiver's address. |

### claimReferrerTier

```solidity
function claimReferrerTier(uint256 poolId_, address receiver_) external payable
```

The function to claim referrer rewards from the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| receiver_ | address | The rewards receiver's address. |

### claimReferrerTierFor

```solidity
function claimReferrerTierFor(uint256 poolId_, address referrer_, address receiver_) external payable
```

The function to claim referrer rewards from the pool for the specified referrer.

_The caller should be whitelisted with `setAddressesAllowedToClaim()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| referrer_ | address | Specified referrer. |
| receiver_ | address | The rewards receiver's address. |

### lockClaim

```solidity
function lockClaim(uint256 rewardPoolIndex_, uint128 claimLockEnd_) external
```

The function to lock rewards and receive power factors.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| claimLockEnd_ | uint128 | The timestamp when the user can claim his rewards. |

### getLatestUserReward

```solidity
function getLatestUserReward(uint256 rewardPoolIndex_, address user_) public view returns (uint256)
```

The function to get the latest user's reward for the specified pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| user_ | address | The user's address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of latest user's rewards. |

### getLatestReferrerReward

```solidity
function getLatestReferrerReward(uint256 rewardPoolIndex_, address user_) public view returns (uint256)
```

The function to get the latest referrer's reward for the specified pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| user_ | address | The user's address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of latest referrer's rewards. |

### getClaimLockPeriodMultiplier

```solidity
function getClaimLockPeriodMultiplier(uint256 rewardPoolIndex_, uint128 claimLockStart_, uint128 claimLockEnd_) public view returns (uint256)
```

The function to get the potential claim lock period power factor.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| claimLockStart_ | uint128 | Claim lock start timestamp. |
| claimLockEnd_ | uint128 | Claim lock end timestamp. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The multiplier. |

### getCurrentUserMultiplier

```solidity
function getCurrentUserMultiplier(uint256 rewardPoolIndex_, address user_) public view returns (uint256)
```

The function to get the current user power factor.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| user_ | address | The user's address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current user multiplier. |

### getReferrerMultiplier

```solidity
function getReferrerMultiplier(uint256 rewardPoolIndex_, address referrer_) public view returns (uint256)
```

The function to get the current referrer's power factor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward poll index. |
| referrer_ | address | The referrer's address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current referrer multiplier. |

### _getUserTotalMultiplier

```solidity
function _getUserTotalMultiplier(uint128 claimLockStart_, uint128 claimLockEnd_, address referrer_) internal pure returns (uint256)
```

### removeUpgradeability

```solidity
function removeUpgradeability() external
```

The function to remove the contract upgradeability.

_Only for the contract `owner()`._

### version

```solidity
function version() external pure returns (uint256)
```

The function to get the contract version.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current contract version |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```


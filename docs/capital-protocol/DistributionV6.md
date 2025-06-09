# Solidity API

## DistributionV6

### DECIMAL

```solidity
uint128 DECIMAL
```

### isNotUpgradeable

```solidity
bool isNotUpgradeable
```

The function to check whether the contract is upgradeable.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### depositToken

```solidity
address depositToken
```

The function to get the address of the deposit token.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### l1Sender

```solidity
address l1Sender
```

The function to get the address of a bridge contract.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### pools

```solidity
struct IDistributionV5.Pool[] pools
```

### poolsData

```solidity
mapping(uint256 => struct IDistributionV5.PoolData) poolsData
```

### usersData

```solidity
mapping(address => mapping(uint256 => struct IDistributionV5.UserData)) usersData
```

### totalDepositedInPublicPools

```solidity
uint256 totalDepositedInPublicPools
```

The function to get the amount of deposit tokens that are staked in all the public pools.

_The value accumulates the amount despite the rate differences._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### poolsLimits

```solidity
mapping(uint256 => struct IDistributionV5.PoolLimits) poolsLimits
```

### referrerTiers

```solidity
mapping(uint256 => struct IReferrer.ReferrerTier[]) referrerTiers
```

### referrersData

```solidity
mapping(address => mapping(uint256 => struct IReferrer.ReferrerData)) referrersData
```

### claimSender

```solidity
mapping(uint256 => mapping(address => mapping(address => bool))) claimSender
```

### claimReceiver

```solidity
mapping(uint256 => mapping(address => address)) claimReceiver
```

### poolExists

```solidity
modifier poolExists(uint256 poolId_)
```

### poolPublic

```solidity
modifier poolPublic(uint256 poolId_)
```

### constructor

```solidity
constructor() public
```

### Distribution_init

```solidity
function Distribution_init(address depositToken_, address l1Sender_, struct IDistributionV5.Pool[] poolsInfo_) external
```

The function to initialize the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| depositToken_ | address | The address of the deposit token. |
| l1Sender_ | address | The address of the bridge contract. |
| poolsInfo_ | struct IDistributionV5.Pool[] | The array of initial pools. |

### createPool

```solidity
function createPool(struct IDistributionV5.Pool pool_) public
```

The function to create a new pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool_ | struct IDistributionV5.Pool | The pool's data. |

### editPool

```solidity
function editPool(uint256 poolId_, struct IDistributionV5.Pool pool_) external
```

### editPoolLimits

```solidity
function editPoolLimits(uint256 poolId_, struct IDistributionV5.PoolLimits poolLimits_) external
```

The function to edit the pool limits.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool id. |
| poolLimits_ | struct IDistributionV5.PoolLimits | The pool's limit data. |

### editReferrerTiers

```solidity
function editReferrerTiers(uint256 poolId_, struct IReferrer.ReferrerTier[] referrerTiers_) external
```

### getPeriodReward

```solidity
function getPeriodReward(uint256 poolId_, uint128 startTime_, uint128 endTime_) public view returns (uint256)
```

The function to calculate the total pool's reward for the specified period.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| startTime_ | uint128 | The start timestamp. |
| endTime_ | uint128 | The end timestamp. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total reward amount. |

### manageUsersInPrivatePool

```solidity
function manageUsersInPrivatePool(uint256 poolId_, address[] users_, uint256[] amounts_, uint128[] claimLockEnds_, address[] referrers_) external
```

The function to manage users and their rate in the private pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| users_ | address[] | The array of users. |
| amounts_ | uint256[] | The array of amounts. |
| claimLockEnds_ | uint128[] | The array of lock ends. |
| referrers_ | address[] | The array of referrers. |

### setClaimSender

```solidity
function setClaimSender(uint256 poolId_, address[] senders_, bool[] isAllowed_) external
```

The function to set the addresses which can claim for `msg.sender`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool ID |
| senders_ | address[] | The addresses list |
| isAllowed_ | bool[] | Allowed or not |

### setClaimReceiver

```solidity
function setClaimReceiver(uint256 poolId_, address receiver_) external
```

The function to set the addresses to receive rewards when call is from any `msg.sender`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool ID |
| receiver_ | address | The receiver address |

### stake

```solidity
function stake(uint256 poolId_, uint256 amount_, uint128 claimLockEnd_, address referrer_) external
```

The function to stake tokens in the public pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| amount_ | uint256 | The amount of tokens to stake. |
| claimLockEnd_ | uint128 | The timestamp when the user can claim his rewards. |
| referrer_ | address | The referrer address. |

### claim

```solidity
function claim(uint256 poolId_, address receiver_) external payable
```

The function to claim rewards from the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| receiver_ | address | The receiver's address. |

### claimFor

```solidity
function claimFor(uint256 poolId_, address staker_, address receiver_) external payable
```

### claimReferrerTier

```solidity
function claimReferrerTier(uint256 poolId_, address receiver_) external payable
```

### claimReferrerTierFor

```solidity
function claimReferrerTierFor(uint256 poolId_, address referrer_, address receiver_) external payable
```

The function to claim referrer rewards from the pool for the specified address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| referrer_ | address | Specified address. |
| receiver_ | address | The receiver's address. |

### withdraw

```solidity
function withdraw(uint256 poolId_, uint256 amount_) external
```

The function to withdraw tokens from the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| amount_ | uint256 | The amount of tokens to withdraw. |

### lockClaim

```solidity
function lockClaim(uint256 poolId_, uint128 claimLockEnd_) external
```

The function to lock rewards.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| claimLockEnd_ | uint128 | The timestamp when the user can claim his rewards. |

### getCurrentUserReward

```solidity
function getCurrentUserReward(uint256 poolId_, address user_) public view returns (uint256)
```

The function to get the user's reward for the specified pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolId_ | uint256 | The pool's id. |
| user_ | address | The user's address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The user's reward amount. |

### getCurrentReferrerReward

```solidity
function getCurrentReferrerReward(uint256 poolId_, address user_) public view returns (uint256)
```

### _applyReferrerTier

```solidity
function _applyReferrerTier(address user_, uint256 poolId_, uint256 currentPoolRate_, uint256 oldDeposited_, uint256 newDeposited_, address oldReferrer_, address newReferrer_) internal
```

### getClaimLockPeriodMultiplier

```solidity
function getClaimLockPeriodMultiplier(uint256 poolId_, uint128 claimLockStart_, uint128 claimLockEnd_) public view returns (uint256)
```

### getCurrentUserMultiplier

```solidity
function getCurrentUserMultiplier(uint256 poolId_, address user_) public view returns (uint256)
```

### getReferrerMultiplier

```solidity
function getReferrerMultiplier(uint256 poolId_, address referrer_) public view returns (uint256)
```

### _getClaimLockPeriodMultiplier

```solidity
function _getClaimLockPeriodMultiplier(uint128 start_, uint128 end_) internal pure returns (uint256)
```

### _getUserTotalMultiplier

```solidity
function _getUserTotalMultiplier(uint128 claimLockStart_, uint128 claimLockEnd_, address referrer_) internal pure returns (uint256)
```

### overplus

```solidity
function overplus() public view returns (uint256)
```

The function to calculate the total overplus of the staked deposit tokens.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total overplus amount. |

### bridgeOverplus

```solidity
function bridgeOverplus(uint256 gasLimit_, uint256 maxFeePerGas_, uint256 maxSubmissionCost_) external payable returns (bytes)
```

The function to bridge the overplus of the staked deposit tokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| gasLimit_ | uint256 | The gas limit. |
| maxFeePerGas_ | uint256 | The max fee per gas. |
| maxSubmissionCost_ | uint256 | The max submission cost. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | The unique identifier for the withdrawal. |

### removeUpgradeability

```solidity
function removeUpgradeability() external
```

The function to remove the upgradeability.

### version

```solidity
function version() external pure returns (uint256)
```

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```


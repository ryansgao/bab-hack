// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Owner-set spending policy and a receipt for every settled payment of a RoboMarket robot.
/// Settlement happens on another chain; this contract holds the permissions and the audit trail.
contract RoboMarketPolicy {
    struct Policy {
        address operator;
        uint256 maxPerCall;
        uint256 maxPerTask;
        uint256 maxPerDay;
        bool active;
    }

    struct Receipt {
        bytes32 robot;
        bytes32 task;
        bytes32 vendorHash;
        uint256 amount;
        bytes32 settlementTx;
        uint256 settlementChainId;
        uint256 timestamp;
    }

    address public immutable owner;
    uint256 public receiptCount;

    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => mapping(bytes32 => bool)) public vendorAllowed;
    mapping(bytes32 => Receipt) public receipts;
    mapping(bytes32 => mapping(bytes32 => uint256)) public spentByTask;
    mapping(bytes32 => mapping(uint256 => uint256)) public spentByDay;
    mapping(bytes32 => uint256) public totalSpent;

    event PolicySet(bytes32 indexed robot, address indexed operator, uint256 maxPerCall, uint256 maxPerTask, uint256 maxPerDay);
    event VendorSet(bytes32 indexed robot, bytes32 indexed vendorHash, string vendorId, bool allowed);
    event ReceiptRecorded(
        bytes32 indexed robot,
        bytes32 indexed task,
        bytes32 indexed requestId,
        string vendorId,
        uint256 amount,
        bytes32 settlementTx,
        uint256 settlementChainId
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setPolicy(bytes32 robot, address operator, uint256 maxPerCall, uint256 maxPerTask, uint256 maxPerDay) external onlyOwner {
        policies[robot] = Policy(operator, maxPerCall, maxPerTask, maxPerDay, true);
        emit PolicySet(robot, operator, maxPerCall, maxPerTask, maxPerDay);
    }

    function setVendors(bytes32 robot, string[] calldata vendorIds, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < vendorIds.length; i++) {
            bytes32 vendorHash = keccak256(bytes(vendorIds[i]));
            vendorAllowed[robot][vendorHash] = allowed;
            emit VendorSet(robot, vendorHash, vendorIds[i], allowed);
        }
    }

    function check(bytes32 robot, bytes32 task, string calldata vendorId, uint256 amount) external view returns (bool ok, string memory reason) {
        return _check(robot, task, keccak256(bytes(vendorId)), amount);
    }

    function record(
        bytes32 robot,
        bytes32 task,
        string calldata vendorId,
        bytes32 requestId,
        uint256 amount,
        bytes32 settlementTx,
        uint256 settlementChainId
    ) external {
        require(msg.sender == policies[robot].operator, "not operator");
        // A stored receipt always has a non-zero timestamp, so it doubles as the "seen" flag.
        require(receipts[requestId].timestamp == 0, "already recorded");
        bytes32 vendorHash = keccak256(bytes(vendorId));
        (bool ok, string memory reason) = _check(robot, task, vendorHash, amount);
        require(ok, reason);
        receipts[requestId] = Receipt(robot, task, vendorHash, amount, settlementTx, settlementChainId, block.timestamp);
        spentByTask[robot][task] += amount;
        spentByDay[robot][block.timestamp / 1 days] += amount;
        totalSpent[robot] += amount;
        receiptCount++;
        emit ReceiptRecorded(robot, task, requestId, vendorId, amount, settlementTx, settlementChainId);
    }

    function _check(bytes32 robot, bytes32 task, bytes32 vendorHash, uint256 amount) internal view returns (bool, string memory) {
        Policy storage p = policies[robot];
        if (!p.active) return (false, "no policy");
        if (!vendorAllowed[robot][vendorHash]) return (false, "vendor not allowed");
        if (amount > p.maxPerCall) return (false, "per-call limit");
        if (spentByTask[robot][task] + amount > p.maxPerTask) return (false, "per-task limit");
        if (spentByDay[robot][block.timestamp / 1 days] + amount > p.maxPerDay) return (false, "daily limit");
        return (true, "");
    }
}

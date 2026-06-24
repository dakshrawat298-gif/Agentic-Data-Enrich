// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIdentityRegistry {
    function resolve(uint256 id) external view returns (address);
    function agentId(address agent) external view returns (uint256);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Settlement
/// @notice x402-style settlement entrypoint. After the Master has verified a Worker's
///         output off-chain, it calls `settle` to transfer the agreed micro-payment to
///         the Worker's ERC-8004 identity. The Master must itself be a registered agent
///         and must have approved this contract to spend its settlement tokens.
contract Settlement {
    IIdentityRegistry public immutable registry;
    IERC20 public immutable token;

    mapping(bytes32 => bool) public settled;

    event JobSettled(
        bytes32 indexed jobId,
        uint256 indexed masterAgentId,
        uint256 indexed workerAgentId,
        address worker,
        uint256 amount
    );

    constructor(address registry_, address token_) {
        registry = IIdentityRegistry(registry_);
        token = IERC20(token_);
    }

    /// @notice Settle a verified enrichment job by paying the Worker.
    /// @param workerAgentId The Worker's ERC-8004 agentId.
    /// @param jobId A unique id for the job (replay-protected).
    /// @param amount The settlement amount in token base units.
    function settle(uint256 workerAgentId, bytes32 jobId, uint256 amount) external {
        uint256 masterAgentId = registry.agentId(msg.sender);
        require(masterAgentId != 0, "master not registered");
        require(!settled[jobId], "already settled");

        address worker = registry.resolve(workerAgentId);
        require(worker != msg.sender, "self settlement");

        settled[jobId] = true;
        require(token.transferFrom(msg.sender, worker, amount), "transfer failed");

        emit JobSettled(jobId, masterAgentId, workerAgentId, worker, amount);
    }
}

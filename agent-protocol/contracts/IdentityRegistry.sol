// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IdentityRegistry
/// @notice Minimal ERC-8004-style on-chain identity registry for autonomous agents.
///         Phase 1 MVP: only the Identity Registry is implemented (no Reputation /
///         Validation registries). For the single-funder MVP, any caller may register
///         an agent address so the deployer can onboard both the Master and the Worker.
contract IdentityRegistry {
    uint256 public nextId = 1;

    mapping(uint256 => address) public agentAddress;
    mapping(address => uint256) public agentId;
    mapping(uint256 => string) public agentDomain;

    event AgentRegistered(uint256 indexed agentId, address indexed agentAddress, string domain);

    /// @notice Register an agent and assign it the next sequential agentId.
    /// @param agent The agent's wallet address (its on-chain identity).
    /// @param domain A human-readable label / domain for the agent.
    /// @return id The newly assigned agentId.
    function register(address agent, string calldata domain) external returns (uint256 id) {
        require(agent != address(0), "zero address");
        require(agentId[agent] == 0, "already registered");
        id = nextId++;
        agentAddress[id] = agent;
        agentId[agent] = id;
        agentDomain[id] = domain;
        emit AgentRegistered(id, agent, domain);
    }

    /// @notice Resolve an agentId to its wallet address.
    function resolve(uint256 id) external view returns (address) {
        address a = agentAddress[id];
        require(a != address(0), "unknown agent");
        return a;
    }
}

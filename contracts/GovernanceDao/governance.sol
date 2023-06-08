// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesQuorumFractionUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract MATRGovernor is
    Initializable,
    GovernorUpgradeable,
    GovernorCountingSimpleUpgradeable,
    GovernorVotesUpgradeable,
    GovernorTimelockControlUpgradeable
{
    uint256 _votingDelay;
    uint256 _votingPeriod;
    uint256 _quorum;
    uint256 _propsoalThreasold;

    function initialize(
        ERC20VotesUpgradeable _token,
        TimelockControllerUpgradeable _timelock,
        uint votingDelay_,
        uint votingPeriod_,
        uint quorum_,
        uint propsoalThreasold
    ) public initializer {
        __Governor_init("MATR Protocol Governor");
        __GovernorCountingSimple_init();
        __GovernorVotes_init(_token);
        __GovernorTimelockControl_init(_timelock);

        _votingDelay = votingDelay_; // 1 block
        _votingPeriod = votingPeriod_; // 1(45818) week
        _quorum = quorum_; // 15k MATR
        _propsoalThreasold = propsoalThreasold;
    }

    /*
     * Events to track params changes
     */
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event VotingDelayUpdated(uint256 oldVotingDelay, uint256 newVotingDelay);
    event VotingPeriodUpdated(uint256 oldVotingPeriod, uint256 newVotingPeriod);

    function votingDelay() public view override returns (uint256) {
        return _votingDelay;
    }

    function votingPeriod() public view override returns (uint256) {
        return _votingPeriod;
    }

    function proposalThreshold() public view override returns (uint256) {
        return _propsoalThreasold;
    }

    function quorum(
        uint256 blockNumber
    ) public view override returns (uint256) {
        require(blockNumber < block.number, "ERC20Votes: block not yet mined");
        return _quorum;
    }

    // governance setters
    function setVotingDelay(uint256 newVotingDelay) public onlyGovernance {
        uint256 oldVotingDelay = _votingDelay;
        _votingDelay = newVotingDelay;
        emit VotingDelayUpdated(oldVotingDelay, newVotingDelay);
    }

    function setVotingPeriod(uint256 newVotingPeriod) public onlyGovernance {
        uint256 oldVotingPeriod = _votingPeriod;
        _votingPeriod = newVotingPeriod;
        emit VotingPeriodUpdated(oldVotingPeriod, newVotingPeriod);
    }

    function setQuorum(uint256 newQuorum) public onlyGovernance {
        uint256 oldQuorum = _quorum;
        _quorum = newQuorum;
        emit QuorumUpdated(oldQuorum, newQuorum);
    }

    // The following functions are overrides required by Solidity.
    function getVotes(
        address account,
        uint256 blockNumber
    )
        public
        view
        override(IGovernorUpgradeable, GovernorVotesUpgradeable)
        returns (uint256)
    {
        return super.getVotes(account, blockNumber);
    }

    function state(
        uint256 proposalId
    )
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    )
        public
        override(GovernorUpgradeable, IGovernorUpgradeable)
        returns (uint256)
    {
        return super.propose(targets, values, calldatas, description);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
    {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (uint256)
    {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

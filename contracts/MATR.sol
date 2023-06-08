// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interface/IUniswapV2Factory.sol";
import "./interface/IUniswapV2Router.sol";

contract MATR is
    Initializable,
    ERC20Upgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");

    // max mint supply
    uint256 public maxMintSupply;
    // buy fee
    uint256 public buyFee;
    // sell fee
    uint256 public sellFee;
    // burn fee
    uint256 public burnFee;
    // fee start time
    uint256 public feeStartTime;
    // fee update period
    uint256 public feeUpdatePeriod;
    // fee decrease percent;
    uint256 public feeDecreasePercent;
    // fix sell fee
    uint256 public fixSellFee;
    // uniswap router address
    IUniswapV2Router public swapRouter;
    // pair address v2
    address public swapPair;
    // pair address v3
    address public v3Pair;
    // trasury address
    address public treasury;
    // master chef contract
    address public masterChef;
    // dead wallet
    address public constant deadWallet =
        address(0x000000000000000000000000000000000000dEaD);
    // whitelist address from fee
    mapping(address => bool) public isWhitelist;

    event setFixSellFee(uint indexed _newFixSellFee);
    event setFeeDecreasePercent(uint indexed _newFeeDecreasePercent);
    event setFeeUpdatePeriod(uint indexed _newFeeUpdatePeriod);
    event setBurnFee(uint indexed _newBurnFee);
    event setSellFee(uint indexed _newSellFee);
    event setBuyFee(uint indexed _newBuyFee);
    event setMaxMintSupply(uint indexed _newMaxMintSupply);
    event setV3Pair(address indexed _pair);
    event setTreasuryAddress(address indexed _treasury);
    event setStakingAddress(address indexed _chef);
    event setWhiteListAddress(address _user, bool _status);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    function initialize(
        uint256 _maxMintSupply,
        uint256 _buyFee,
        uint256 _sellFee,
        uint256 _burnFee,
        uint256 _feeStartTime,
        uint256 _feeUpdatePeriod,
        uint256 _feeDecreasePercent,
        uint256 _fixSellFee,
        uint256 _supply,
        IUniswapV2Router _swapRouter
    ) public initializer {
        __ERC20_init("MATR", "MATR");
        __Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init("MATR");
        __ERC20Votes_init_unchained();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _mint(msg.sender, _supply * 10 ** decimals());
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(DAO_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        maxMintSupply = _maxMintSupply;
        burnFee = _burnFee;
        sellFee = _sellFee;
        buyFee = _buyFee;
        feeStartTime = _feeStartTime;
        feeUpdatePeriod = _feeUpdatePeriod;
        feeDecreasePercent = _feeDecreasePercent;
        fixSellFee = _fixSellFee;
        swapRouter = _swapRouter;
    }

    // method to initialize v2 pair
    function initV2Pair() public onlyRole(ADMIN_ROLE) {
        IUniswapV2Router _uniswapRouter = IUniswapV2Router(swapRouter);
        address _pair = IUniswapV2Factory(_uniswapRouter.factory()).getPair(
            address(this),
            _uniswapRouter.WETH()
        );
        if (_pair == address(0)) {
            swapPair = IUniswapV2Factory(_uniswapRouter.factory()).createPair(
                address(this),
                _uniswapRouter.WETH()
            );
        } else {
            swapPair = _pair;
        }
    }

    // method to set v3 pair address
    function setV3PairAddress(address _pair) public onlyRole(ADMIN_ROLE) {
        v3Pair = _pair;
        emit setV3Pair(_pair);
    }

    // method to set treasury address
    function updateTreasuryAddress(address _treasury) public onlyRole(ADMIN_ROLE) {
        treasury = _treasury;
        emit setTreasuryAddress(_treasury);
    }

    // method set staking contract address
    function setMasterChefAddress(address _chef) public onlyRole(ADMIN_ROLE) {
        masterChef = _chef;
        emit setStakingAddress(_chef);
    }

    // method to whitelist address from tax fee
    function whiteListAddress(
        address _user,
        bool _status
    ) public onlyRole(ADMIN_ROLE) {
        require(isWhitelist[_user] != _status, "Already in same status");
        isWhitelist[_user] = _status;
        emit setWhiteListAddress(_user, _status);
    }

    // method to pause contract functionality
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    // method to unpause contract functionality
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // method to mint new tokens
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require((totalSupply() + amount) <= maxMintSupply, "Mint Cap Reached");
        _mint(to, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    // The following functions are overrides required by Solidity.
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._mint(to, amount);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable) {
        uint256 taxAmount = 0;
        uint _burnFee = 0;

        if (to == swapPair || to == v3Pair) {
            taxAmount = (amount * getSellFee()) / 10000;
            _burnFee = (amount * burnFee) / 10000;
        } else if (from == swapPair || from == v3Pair) {
            taxAmount = (amount * getBuyFee()) / 10000;
            _burnFee = (amount * burnFee) / 10000;
        }
        
        if (isWhitelist[from] == true || isWhitelist[to] == true) {
            _burnFee = 0;
            taxAmount = 0;
        }
        if (taxAmount > 0 || _burnFee > 0) {
            super._transfer(from, treasury, taxAmount);
            super._transfer(from, deadWallet, _burnFee);
        }
        super._transfer(from, to, amount - (taxAmount + _burnFee));
    }

    function _burn(
        address account,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._burn(account, amount);
    }

    // method to get sell fee 
    function getSellFee() public view returns (uint) {
        uint256 _durationCycle = (block.timestamp - feeStartTime) /
            feeUpdatePeriod;
        if (sellFee > (feeDecreasePercent * _durationCycle)) {
            return (sellFee - (feeDecreasePercent * _durationCycle));
        } else {
            return fixSellFee;
        }
    }

    // method to get buy fee
    function getBuyFee() public view returns (uint) {
        uint256 _durationCycle = (block.timestamp - feeStartTime) /
            feeUpdatePeriod;
        if (buyFee > (feeDecreasePercent * _durationCycle)) {
            return (buyFee - (feeDecreasePercent * _durationCycle));
        } else {
            return 0;
        }
    }

    // method to update max mint supply
    function updateMaxMintSupply(
        uint256 _newMaxMintSupply
    ) public onlyRole(DAO_ROLE) {
        require(_newMaxMintSupply >= totalSupply(), "Invalid max mint supply");
        maxMintSupply = _newMaxMintSupply;
        emit setMaxMintSupply(_newMaxMintSupply);
    }

    // method to update buy fee
    function updateBuyFee(uint256 _newBuyFee) public onlyRole(DAO_ROLE) {
        buyFee = _newBuyFee;
        emit setBuyFee(_newBuyFee);
    }

    // method to update sell fee
    function updateSellFee(uint256 _newSellFee) public onlyRole(DAO_ROLE) {
        sellFee = _newSellFee;
        emit setSellFee(_newSellFee);
    }

    // method to update burn fee
    function updateBurnFee(uint256 _newBurnFee) public onlyRole(DAO_ROLE) {
        burnFee = _newBurnFee;
        emit setBurnFee(_newBurnFee);
    }

    function updateFeeUpdatePeriod(
        uint256 _newFeeUpdatePeriod
    ) public onlyRole(DAO_ROLE) {
        feeUpdatePeriod = _newFeeUpdatePeriod;
        emit setFeeUpdatePeriod(_newFeeUpdatePeriod);
    }

    // method to update fee decrease percent
    function updateFeeDecreasePercent(
        uint256 _newFeeDecreasePercent
    ) public onlyRole(DAO_ROLE) {
        feeDecreasePercent = _newFeeDecreasePercent;
        emit setFeeDecreasePercent(_newFeeDecreasePercent);
    }

    // method to update fix sell fee
    function updateFixSellFee(
        uint256 _newFixSellFee
    ) public onlyRole(DAO_ROLE) {
        fixSellFee = _newFixSellFee;
        emit setFixSellFee(_newFixSellFee);
    }
}

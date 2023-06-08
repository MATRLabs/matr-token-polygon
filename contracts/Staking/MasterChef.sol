// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "../interface/IERC721.sol";

interface IUniswapV3PositionUtility {
    function getMATRAmount(uint256 _tokenID) external view returns (uint256);
}

// MasterChef was the master of MATR. He now governs over MATRS. He can make MATRs and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once MATRS is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    IERC721ReceiverUpgradeable
{
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 erc721TokenId; // v3 lp token
        //
        // We do some fancy math here. Basically, any point in time, the amount of MATRs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accMATRPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accMATRPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20Upgradeable lpToken; // Address of LP token contract.
        address v2LpToken; // Address of LP token contract
        uint256 allocPoint; // How many allocation points assigned to this pool. MATRs to distribute per block.
        uint256 lastRewardBlock; // Last block number that MATRs distribution occurs.
        uint256 accMATRPerShare; // Accumulated MATRs per share, times 1e12. See below.
    }

    // The MATR TOKEN!Working on v-empire and revolt task

    IERC20Upgradeable public MATR;
    // Block number when bonus MATR period ends.
    uint256 public bonusEndBlock;
    // MATR tokens created per block.
    uint256 public MATRPerBlock;
    // Bonus muliplier for early MATR makers.
    uint256 public constant BONUS_MULTIPLIER = 1;
    // total native token staked
    uint256 public totalNativeTokenStaked;
    // uniswap v3 position address
    IUniswapV3PositionUtility public uniswapUtility;
    // uniswap v3 lp erc721 address
    IERC721 public erc721Token;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;
    // The block number when MATR mining starts.
    uint256 public startBlock;
    // uniswap v3 pool supply
    uint256 public uniswapV3LpSupply;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event SetUtilityContractAddress(
        IUniswapV3PositionUtility indexed _uniswapUtility
    );
    event SetERC721ContractAddress(IERC721 indexed _erc721);
    event updateMATRPerBlock(uint indexed _MATRPerBlock);
    event updateBonusEndBlock(uint indexed _bonusEndBlock);

    function initialize(
        IERC20Upgradeable _MATR,
        uint256 _MATRPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        MATR = _MATR;
        MATRPerBlock = _MATRPerBlock;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20Upgradeable _lpToken,
        IERC721 _erc721,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                v2LpToken: address(_erc721),
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accMATRPerShare: 0
            })
        );
    }

    // Update the given pool's MATR allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(
        uint256 _from,
        uint256 _to
    ) public view returns (uint256 _diff) {
        if (_to <= bonusEndBlock) {
            return _to.sub(_from).mul(BONUS_MULTIPLIER);
        } else if (_to >= bonusEndBlock) {
            return 0;
        }
    }

    // View function to see pending MATRs on frontend.
    function pendingMATR(
        uint256 _pid,
        address _user
    ) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accMATRPerShare = pool.accMATRPerShare;
        uint256 lpSupply;
        if (_pid == 0) {
            lpSupply = totalNativeTokenStaked;
        } else if (_pid == 1) {
            lpSupply = uniswapV3LpSupply;
        } else {
            lpSupply = pool.lpToken.balanceOf(address(this));
        }
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(
                pool.lastRewardBlock,
                block.number
            );
            uint256 MATRReward = multiplier
                .mul(MATRPerBlock)
                .mul(pool.allocPoint)
                .div(totalAllocPoint);
            accMATRPerShare = accMATRPerShare.add(
                MATRReward.mul(1e12).div(lpSupply)
            );
        }
        return user.amount.mul(accMATRPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply;
        if (_pid == 0) {
            lpSupply = totalNativeTokenStaked;
        } else if (_pid == 1) {
            lpSupply = uniswapV3LpSupply;
        } else {
            lpSupply = pool.lpToken.balanceOf(address(this));
        }

        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 MATRReward = multiplier
            .mul(MATRPerBlock)
            .mul(pool.allocPoint)
            .div(totalAllocPoint);
        pool.accMATRPerShare = pool.accMATRPerShare.add(
            MATRReward.mul(1e12).div(lpSupply)
        );
        pool.lastRewardBlock = block.number;
    }

    function transferNFTandGetAmount(
        uint256 _tokenId
    ) internal returns (uint256) {
        uint256 _amount;
        address _token0;
        address _token1;

        (, , _token0, _token1, , , , , , , , ) = erc721Token.positions(
            _tokenId
        );
        _amount = uniswapUtility.getMATRAmount(_tokenId);
        erc721Token.safeTransferFrom(
            address(msg.sender),
            address(this),
            _tokenId
        );

        return _amount;
    }

    // Deposit LP tokens to MasterChef for MATR allocation.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        uint256 _tokenId,
        bool _isERC721
    ) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user
                .amount
                .mul(pool.accMATRPerShare)
                .div(1e12)
                .sub(user.rewardDebt);
            safeMATRTransfer(msg.sender, pending);
        }
        if (_pid != 1) {
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
        }

        if (_pid == 0) {
            totalNativeTokenStaked = totalNativeTokenStaked.add(_amount);
        } else if (_pid == 1 && (_isERC721 == true)) {
            _amount = transferNFTandGetAmount(_tokenId);
            user.erc721TokenId = _tokenId;
            uniswapV3LpSupply = uniswapV3LpSupply.add(_amount);
        }
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accMATRPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accMATRPerShare).div(1e12).sub(
            user.rewardDebt
        );
        safeMATRTransfer(msg.sender, pending);
        if (_pid == 0) {
            totalNativeTokenStaked = totalNativeTokenStaked.sub(_amount);
        }
        if (_pid != 1) {
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
            user.amount = user.amount.sub(_amount);
            user.rewardDebt = user.amount.mul(pool.accMATRPerShare).div(1e12);
        } else if (_pid == 1) {
            _amount = user.amount;
            user.amount = 0;
            user.rewardDebt = user.amount.mul(pool.accMATRPerShare).div(1e12);
            erc721Token.safeTransferFrom(
                address(this),
                address(msg.sender),
                user.erc721TokenId
            );
            uniswapV3LpSupply = uniswapV3LpSupply.sub(_amount);
            user.erc721TokenId = 0;
        }
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Safe MATR transfer function, just in case if rounding error causes pool to not have enough MATRs.
    function safeMATRTransfer(address _to, uint256 _amount) internal {
        uint256 MATRBal = MATR.balanceOf(address(this)).sub(
            totalNativeTokenStaked
        );
        if (_amount > MATRBal) {
            MATR.transfer(_to, MATRBal);
        } else {
            MATR.transfer(_to, _amount);
        }
    }

    // **** Additional functions separate from the original masterchef contract ****

    function setMATRPerBlock(uint256 _MATRPerBlock) public onlyOwner {
        require(_MATRPerBlock > 0, "!MATRPerBlock-0");
        massUpdatePools();
        MATRPerBlock = _MATRPerBlock;
        emit updateMATRPerBlock(_MATRPerBlock);
    }

    // method to update bonus end block
    function setBonusEndBlock(uint256 _bonusEndBlock) public onlyOwner {
        massUpdatePools();
        bonusEndBlock = _bonusEndBlock;
        emit updateBonusEndBlock(_bonusEndBlock);
    }

    function _authorizeUpgrade(address) internal view override {
        require(owner() == msg.sender, "Only owner can upgrade implementation");
    }

    // method to set utility contract address
    function setUtilityContractAddress(
        IUniswapV3PositionUtility _uniswapUtility
    ) external onlyOwner {
        uniswapUtility = _uniswapUtility;
        emit SetUtilityContractAddress(_uniswapUtility);
    }

    // method to set v3 pair erc721 contract address
    function setERC721ContractAddress(IERC721 _erc721) external onlyOwner {
        erc721Token = _erc721;
        emit SetERC721ContractAddress(_erc721);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }
}

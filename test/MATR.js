const { parse } = require("@ethersproject/transactions");
const { contract, privateKeys } = require("@openzeppelin/test-environment");
const {
    BN,
    expectRevert,
    expectEvent,
    constants,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { time } = require("../utilities");

const {
    address,
    etherMantissa,
    encodeParameters,
    mineBlock,
    increaseTime
} = require("../utilities/Ethereum");

let ownerAddress;
let userAddress1;
let userAddress2;
const MATRToken = artifacts.require("MATR");
const decimal = new BN(18);
const oneether = new BN(10).pow(decimal);
const totalSupply = new BN(1000000000);
const maxSupply = new BN(10000000000).mul(oneether);

describe("ERC20 tokens", function () {
    beforeEach(async function () {
        accounts = await web3.eth.getAccounts();
        [ownerAddress, userAddress1, userAddress2, treasuryAdress, v3PairAddress, masterChefAddress] = accounts;

        this.matr = await MATRToken.new({ from: ownerAddress, gas: 8000000 });

        const block = await ethers.provider.getBlock("latest")
        let blocktime = block.timestamp;

        await this.matr.initialize(maxSupply, 200, 200, 50, blocktime, 300, 50, 50, totalSupply, userAddress2, {
            from: ownerAddress,
            gas: 8000000,
        });

        await this.matr.updateTreasuryAddress(treasuryAdress, { from: ownerAddress });
        await this.matr.setV3PairAddress(v3PairAddress, { from: ownerAddress });
        await this.matr.setMasterChefAddress(masterChefAddress, { from: ownerAddress });
    });

    describe("Transfer functionality ", function () {
        beforeEach(async function () { });

        it("Tranfer from Account 1 to Account 2", async function () {
            await this.matr.transfer(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(ownerAddress)).to.be.bignumber.equal(
                new BN(999950000).mul(oneether)
            );
        });

        it("Account 1 balance should be increased", async function () {
            await this.matr.transfer(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(50000).mul(oneether)
            );
        });

        it("Account 1 balance should be decreased", async function () {
            await this.matr.transfer(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await expectRevert(
                this.matr.transfer(ownerAddress, new BN(50000).mul(oneether), {
                    from: userAddress2,
                }),
                "ERC20: transfer amount exceeds balance"
            );
        });

        it("fee on sell", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(48750).mul(oneether)
            );
        });

        it("fee on buy", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(46800).mul(oneether)
            );
        });

        it("fee transfer on treasury", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(treasuryAdress)).to.be.bignumber.equal(
                new BN(1960).mul(oneether)
            );
        });
    });

    describe("Transfer functionality with tax time", function () {
        beforeEach(async function () { });

        it("Initial tax 0%", async function () {
            await this.matr.transfer(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(50000).mul(oneether)
            );
        });

        it("initial fee on sell 2%+0.5%", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(48750).mul(oneether)
            );
        });

        it("after 1 phase fee on sell 1.5%+0.5%", async function () {
            await increaseTime(400);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(49000).mul(oneether)
            );
        });

        it("after 2 phase fee on sell 1%+0.5%", async function () {
            await increaseTime(700);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(49250).mul(oneether)
            );
        });

        it("after 3 phase fee on sell 0.5%+0.5%", async function () {
            await increaseTime(1000);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(49500).mul(oneether)
            );
        });

        it("final fee on sell 0.5%+0.5%", async function () {
            await increaseTime(3000);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(v3PairAddress)).to.be.bignumber.equal(
                new BN(49500).mul(oneether)
            );
        });

        it("initial fee on buy 2%+0.5%", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(46800).mul(oneether)
            );
        });

        it("after 1 phase fee on buy 1.5%+0.5%", async function () {
            await increaseTime(400);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(47040).mul(oneether)
            );
        });

        it("after 2 phase fee on buy 1%+0.5%", async function () {
            await increaseTime(700);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(47280).mul(oneether)
            );
        });

        it("after 3 phase fee on buy 0.5%+0.5%", async function () {
            await increaseTime(1000);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(47520).mul(oneether)
            );
        });

        it("after 4 phase fee on buy 0%+0.5%", async function () {
            await increaseTime(1300);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(47760).mul(oneether)
            );
        });

        it("final fee on buy 0%+0.5%", async function () {

            await increaseTime(2000);
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(47760).mul(oneether)
            );
        });

        it("fee transfer on treasury", async function () {
            await this.matr.transfer(v3PairAddress, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transfer(userAddress1, new BN(48000).mul(oneether), {
                from: v3PairAddress,
            });
            expect(await this.matr.balanceOf(treasuryAdress)).to.be.bignumber.equal(
                new BN(1960).mul(oneether)
            );
        });

        it("No fee transfer on whitelist", async function () {
            await this.matr.whiteListAddress(userAddress2, true, {
                from: ownerAddress,
            });

            await this.matr.transfer(userAddress2, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            expect(await this.matr.balanceOf(userAddress2)).to.be.bignumber.equal(
                new BN(50000).mul(oneether)
            );

            await this.matr.transfer(userAddress1, new BN(50000).mul(oneether), {
                from: userAddress2,
            });
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(50000).mul(oneether)
            );
        });
    });

    describe("Transfer from", function () {
        beforeEach(async function () { });

        it("WithOut Approve", async function () {
            await expectRevert(
                this.matr.transferFrom(ownerAddress, userAddress1, 1000, {
                    from: ownerAddress,
                }),
                "ERC20: transfer amount exceeds allowance"
            );
        });

        it("Tranfer from Account 1 to Account 2", async function () {
            await this.matr.approve(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transferFrom(
                ownerAddress,
                userAddress1,
                new BN(50000).mul(oneether),
                { from: userAddress1 }
            );
            expect(await this.matr.balanceOf(ownerAddress)).to.be.bignumber.equal(
                new BN(999950000).mul(oneether)
            );
        });

        it("Account 1 balance should be increased", async function () {
            await this.matr.approve(userAddress1, new BN(50000).mul(oneether), {
                from: ownerAddress,
            });
            await this.matr.transferFrom(
                ownerAddress,
                userAddress1,
                new BN(50000).mul(oneether),
                { from: userAddress1 }
            );
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(
                new BN(50000).mul(oneether)
            );
        });
    });

    describe("Approve/Allowance", function () {
        beforeEach(async function () { });

        it("Initial allowance will be 0", async function () {
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(0));
        });

        it("Allowance increase when approve", async function () {
            await this.matr.approve(userAddress2, 500, { from: ownerAddress });
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(500));
        });

        it("Increase Allowance", async function () {
            await this.matr.increaseAllowance(userAddress2, 500, {
                from: ownerAddress,
            });
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(500));
        });

        it("Decrease Allowance", async function () {
            await this.matr.approve(userAddress2, 500, { from: ownerAddress });
            await this.matr.decreaseAllowance(userAddress2, 500, {
                from: ownerAddress,
            });
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(0));
        });

        it("Allowance will be 0 of tx account", async function () {
            await this.matr.approve(userAddress2, 500, { from: ownerAddress });
            expect(
                await this.matr.allowance(userAddress2, ownerAddress)
            ).to.be.bignumber.equal(new BN(0));
        });

        it("TranferFrom failed without allowance", async function () {
            await expectRevert(
                this.matr.transferFrom(ownerAddress, userAddress1, 100000000000, {
                    from: ownerAddress,
                }),
                "ERC20: transfer amount exceeds allowance"
            );
        });

        it("TranferFrom with allowance", async function () {
            await this.matr.approve(userAddress2, 500, { from: ownerAddress });
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(500));

            await this.matr.transferFrom(ownerAddress, userAddress2, 500, {
                from: userAddress2,
            });
            expect(
                await this.matr.allowance(ownerAddress, userAddress2)
            ).to.be.bignumber.equal(new BN(0));

            expect(await this.matr.balanceOf(userAddress2)).to.be.bignumber.equal(
                new BN(500)
            );
        });
    });

    describe("V3 Pair functionality ", function () {
        beforeEach(async function () { });

        it("failed if non admin try to update values", async function () {
            let role = await this.matr.ADMIN_ROLE();
            await expectRevert(
                this.matr.setV3PairAddress(userAddress1, {
                    from: userAddress1,
                }),
                "AccessControl: account " + userAddress1.toLowerCase() + " is missing role " + role
            );
        });

        it("if admin try to update values", async function () {
            await this.matr.setV3PairAddress(userAddress1, {
                from: ownerAddress,
            });

            expect(await this.matr.v3Pair()).to.equal(
                userAddress1
            );
        });
    });

    describe("Treasury functionality ", function () {
        beforeEach(async function () { });

        it("failed if non admin try to update values", async function () {
            let role = await this.matr.ADMIN_ROLE();
            await expectRevert(
                this.matr.updateTreasuryAddress(userAddress1, {
                    from: userAddress1,
                }),
                "AccessControl: account " + userAddress1.toLowerCase() + " is missing role " + role
            );
        });

        it("if admin try to update values", async function () {
            await this.matr.updateTreasuryAddress(userAddress1, {
                from: ownerAddress,
            });

            expect(await this.matr.treasury()).to.equal(
                userAddress1
            );
        });
    });

    describe("MasterChef functionality ", function () {
        beforeEach(async function () { });

        it("failed if non admin try to update values", async function () {
            let role = await this.matr.ADMIN_ROLE();
            await expectRevert(
                this.matr.setMasterChefAddress(userAddress1, {
                    from: userAddress1,
                }),
                "AccessControl: account " + userAddress1.toLowerCase() + " is missing role " + role
            );
        });

        it("if admin try to update values", async function () {
            await this.matr.setMasterChefAddress(userAddress1, {
                from: ownerAddress,
            });

            expect(await this.matr.masterChef()).to.equal(
                userAddress1
            );
        });
    });

    describe("whiteListAddress functionality ", function () {
        beforeEach(async function () { });

        it("failed if non admin try to update values", async function () {
            let role = await this.matr.ADMIN_ROLE();
            await expectRevert(
                this.matr.whiteListAddress(userAddress1, true, {
                    from: userAddress1,
                }),
                "AccessControl: account " + userAddress1.toLowerCase() + " is missing role " + role
            );
        });

        it("if admin try to update values", async function () {
            await this.matr.whiteListAddress(userAddress1, true, {
                from: ownerAddress,
            });

            expect(await this.matr.isWhitelist(userAddress1)).to.equal(
                true
            );
        });

        it("if admin try to update values", async function () {
            await this.matr.whiteListAddress(userAddress1, true, {
                from: ownerAddress,
            });

            await this.matr.whiteListAddress(userAddress1, false, {
                from: ownerAddress,
            });

            expect(await this.matr.isWhitelist(userAddress1)).to.equal(
                false
            );
        });
    });

    describe("Mint functionality ", function () {
        beforeEach(async function () { });

        it("failed if non minter try to mint values", async function () {
            let role = await this.matr.MINTER_ROLE();
            await expectRevert(
                this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                    from: userAddress1,
                }),
                "AccessControl: account " + userAddress1.toLowerCase() + " is missing role " + role
            );
        });

        it("if admin try to mint values", async function () {
            let role = await this.matr.MINTER_ROLE();
            await this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(2000000000).mul(oneether)
            );

            await this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(3000000000).mul(oneether)
            );

            await this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(4000000000).mul(oneether)
            );

            await this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(5000000000).mul(oneether)
            );

            await this.matr.mint(userAddress1, new BN(4000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(9000000000).mul(oneether)
            );

            await this.matr.mint(userAddress1, new BN(1000000000).mul(oneether), {
                from: ownerAddress,
            });

            expect(await this.matr.totalSupply()).to.be.bignumber.equal(
                new BN(10000000000).mul(oneether)
            );

            await expectRevert(
                this.matr.mint(userAddress1, new BN(1).mul(oneether), {
                    from: ownerAddress,
                }),
                "Mint Cap Reached"
            );
        });
    });
});
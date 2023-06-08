const { parse } = require("@ethersproject/transactions");
const { contract, privateKeys } = require("@openzeppelin/test-environment");
const {
    BN,
    expectRevert,
    expectEvent,
    constants,
} = require("@openzeppelin/test-helpers");
const { expect, use } = require("chai");
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
const MockToken = artifacts.require("MockToken");
const MasterChef = artifacts.require("MasterChef");
const decimal = new BN(18);
const oneether = new BN(10).pow(decimal);
const totalSupply = new BN(1000000000);
const maxSupply = new BN(10000000000).mul(oneether);

describe("Master Chef tokens", function () {
    beforeEach(async function () {
        accounts = await web3.eth.getAccounts();
        [ownerAddress, userAddress1, userAddress2, userAddress3, treasuryAdress, v3PairAddress] = accounts;

        this.lp = await MockToken.new({ from: ownerAddress, gas: 8000000 });
        await this.lp.initialize({ from: ownerAddress, gas: 8000000 });

        const block = await ethers.provider.getBlock("latest")
        let blocktime = block.timestamp;

        this.matr = await MATRToken.new({ from: ownerAddress, gas: 8000000 });
        await this.matr.initialize(maxSupply, 200, 200, 50, blocktime, 300, 50, 50, totalSupply, userAddress2, {
            from: ownerAddress,
            gas: 8000000,
        });

        this.chef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
        await this.chef.initialize(this.matr.address, "1000", "0", "2000", { from: ownerAddress, gas: 8000000 });

        await this.matr.updateTreasuryAddress(treasuryAdress, { from: ownerAddress });
        await this.matr.setV3PairAddress(v3PairAddress, { from: ownerAddress });
        await this.matr.setMasterChefAddress(this.chef.address, { from: ownerAddress });
        await this.matr.whiteListAddress(this.chef.address, true, { from: ownerAddress });
    });

    describe("Add lp in pool", function () {
        beforeEach(async function () { });

        it("If non owner", async function () {
            await expectRevert(
                this.chef.add(100, this.matr.address, ownerAddress, true, {
                    from: userAddress2,
                }),
                "Ownable: caller is not the owner"
            );
        });

        it("If Only owner", async function () {
            await this.chef.add(100, this.matr.address, ownerAddress, true, {
                from: ownerAddress
            });

            let pool = await this.chef.poolInfo(0);
            expect(pool.lpToken).to.equal(this.matr.address);
        });
    });

    describe("Deposit lp in pool", function () {
        beforeEach(async function () {
            await this.chef.add(100, this.matr.address, ownerAddress, true, {
                from: ownerAddress
            });
        });

        it("If not hold tokens", async function () {
            await expectRevert(
                this.chef.deposit(0, 100, 0, false, {
                    from: userAddress2,
                }),
                "ERC20: transfer amount exceeds balance"
            );
        });

        it("If hold tokens but not approve", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await expectRevert(
                this.chef.deposit(0, 100, 0, false, {
                    from: userAddress1,
                }),
                "ERC20: transfer amount exceeds allowance"
            );
        });

        it("If hold tokens and approve", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(1000));

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(2000));
        });

        it("If hold tokens and approve(Multiple users)", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.matr.transfer(userAddress2, 10000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress2 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress2,
            });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(500));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(1500));

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(1000));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(2000));
        });
    });

    describe("Claim Reward tokens", function () {
        beforeEach(async function () {
            await this.chef.add(100, this.matr.address, ownerAddress, true, {
                from: ownerAddress
            });
        });

        it("Show 0 if not invested", async function () {
            await this.matr.transfer(userAddress1, 10000);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
        });

        it("If hold tokens and approve and try to claim", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.transfer(this.chef.address, 100000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(1000));

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(2000));

            await this.chef.deposit(0, 0, 0, false, {
                from: userAddress1,
            }); 

            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(12900));
        });

        it("If hold tokens and approve(Multiple users) and claim", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.transfer(this.chef.address, 100000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.matr.transfer(userAddress2, 10000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress2 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress2,
            });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(500));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(1500));

            await this.chef.deposit(0, 0, 0, false, {
                from: userAddress1,
            }); 

            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(10900));

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(500));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(2500));
        });
    });

    describe("Withdraw deposit tokens", function () {
        beforeEach(async function () {
            await this.chef.add(100, this.matr.address, ownerAddress, true, {
                from: ownerAddress
            });
        });

        it("Failed if not deposit", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await expectRevert(this.chef.withdraw(0, userAddress1), "withdraw: not good");
        });

        it("If hold tokens and approve and try to withdraw", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.transfer(this.chef.address, 100000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(1000));

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(2000));

            await this.chef.withdraw(0, 50, {
                from: userAddress1,
            }); 

            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(12950));
        });

        it("If hold tokens and approve(Multiple users) and withdraw", async function () {
            await this.matr.transfer(userAddress1, 10000);
            await this.matr.transfer(this.chef.address, 100000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress1 });

            await this.matr.transfer(userAddress2, 10000);
            await this.matr.approve(this.chef.address, 100, { from: userAddress2 });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress2,
            });

            await this.chef.deposit(0, 100, 0, false, {
                from: userAddress1,
            });

            await mineBlock(10);
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(500));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(1500));

            await this.chef.withdraw(0, 100, {
                from: userAddress1,
            }); 

            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.matr.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(11000));

            await mineBlock(10);

            await this.chef.withdraw(0, 100, {
                from: userAddress2,
            }); 
            expect(await this.chef.pendingMATR(0, userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.chef.pendingMATR(0, userAddress2)).to.be.bignumber.equal(new BN(0));
        });
    });
});
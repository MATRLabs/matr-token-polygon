const { ethers, upgrades } = require("hardhat");

async function main() {
  const contract = await ethers.getContractFactory("MasterChef");
  const upgrade = await upgrades.upgradeProxy(
    "0x8E4ABDC3dEfdFeF1dD05e75d97ee7b53280c3314",
    contract
  );
  console.log("Contract upgraded", upgrade);
}

main();
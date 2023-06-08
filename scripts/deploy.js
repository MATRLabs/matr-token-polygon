const { ethers, upgrades } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer address: ', deployer.address);

  const MATR = await ethers.getContractFactory('MATR');
  const routerAddress = "";

  const matr = await upgrades.deployProxy(MATR, ["1000000000000000000000000000", 200, 200, 50, "10000000000", "1000", 50, 50, "10000000000000000000000000000", routerAddress]);
  await matr.deployed();

  const matrImp = await upgrades.erc1967.getImplementationAddress(
    matr.address
  );

  console.log(
    'MATR proxy address: ',
    matr.address,
    '\n',
    'MATR implementation address: ',
    matrImp
  );

  const MasterChef = await ethers.getContractFactory('MasterChef');

  const chef = await upgrades.deployProxy(MasterChef, [matr.address, "1000000000000000000", 9059090, 9049090]);
  await MasterChef.deploy();

  const chefImp = await upgrades.erc1967.getImplementationAddress(
    chef.address
  );

  console.log(
    'MATR Staking proxy address: ',
    chef.address,
    '\n',
    'MATR Staking implementation address: ',
    chefImp
  );

  const UniswapV3PositionUtility = await ethers.getContractFactory('UniswapV3PositionUtility');

  await UniswapV3PositionUtility.deploy();

  const Timelock = await ethers.getContractFactory('MATRTimelock');

  const timeLOck = await upgrades.deployProxy(Timelock, [300, [], []]);
  await timeLOck.deployed();

  const timelockImp = await upgrades.erc1967.getImplementationAddress(
    timeLOck.address
  );

  console.log(
    'Time Lock proxy address: ',
    timeLOck.address,
    '\n',
    'TimeLock implementation address: ',
    timelockImp
  );

  const MATRGovernor = await ethers.getContractFactory('MATRGovernor');

  const gov = await upgrades.deployProxy(MATRGovernor, ["0x06d1f27a354C98aA3aC32d7b4d1504842FF93dAD", timeLOck.address]);
  await MATRGovernor.deploy();

  const govImp = await upgrades.erc1967.getImplementationAddress(
    gov.address
  );

  console.log(
    'Gov proxy address: ',
    gov.address,
    '\n',
    'Gov implementation address: ',
    govImp
  );

}

main();

require("dotenv-load")();

const { allCurrencies } = require("../blockchain");

(async () => {
  for (const [name, currency] of allCurrencies.entries()) {
    console.log(`Checking currency ${name}:`);

    if (await currency.checkConfiguration()) {
      process.exitCode = 1;
    }

    try {
      const balance = await currency.getMasterWalletBalance();

      console.log(`- Master wallet balance is ${balance}`);
    } catch (e) {
      process.exitCode = 1;
      console.log("! Error fetching master wallet balance:");
      console.log(e);
    }
  }
})();

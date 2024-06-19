const { payLostLevelupRewards } = require("./gamificationService");

async function run() {
  await payLostLevelupRewards();
}

module.exports.getJobs = function getJobs() {
  return [
    {
      name: "pay-lost-levelup-rewards",
      description:
        "Pay missed levelup rewards. E.g. if experience threshold was lowered during configuration update.",
      run,
    },
  ];
};

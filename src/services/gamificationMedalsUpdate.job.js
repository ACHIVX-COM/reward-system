const { updateMedals } = require("./gamificationService");

async function run() {
  await updateMedals();
}

module.exports.getJobs = function getJobs() {
  return [
    {
      name: "update-medals",
      description: "Updates (gives and recalls) medals",
      run,
    },
  ];
};

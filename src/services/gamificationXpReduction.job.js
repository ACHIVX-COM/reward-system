async function reduceXP() {
  throw new Error("Not implemented");
}

module.exports.getJobs = function getJobs() {
  return [
    {
      name: "reduce-xp",
      description: "Reduces XP of long inactive accounts",
      run: reduceXP,
    },
  ];
};

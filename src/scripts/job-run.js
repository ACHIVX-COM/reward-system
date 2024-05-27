require("dotenv-load")();

const { findJobs, runJob } = require("../services/jobsService");
const { connect, disconnect } = require("../components/mongoose");

if (process.argv.length !== 3) {
  console.error("Error: exactly one argument (job name) is required.");
  process.exit(1);
}

const jobName = process.argv[2];

const allJobs = findJobs();

if (!allJobs.has(jobName)) {
  console.error(`Error: Unknown job name: '${jobName}'`);
  process.exit(1);
}

(async () => {
  await connect();

  try {
    await runJob(allJobs.get(jobName));
  } catch (e) {
    console.error(`Error running ${jobName}:`, e);
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
})();

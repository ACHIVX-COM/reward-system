require("dotenv-load")();

const { findJobs } = require("../services/jobsService");

for (const [name, job] of findJobs().entries()) {
  console.log(`- ${name}\t${job.description ?? ""}`);
}

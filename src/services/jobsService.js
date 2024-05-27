const { join } = require("node:path");
const requireAll = require("require-all");
const { JobStatusModel, JOB_STATES } = require("../models/JobStatusModel");

/**
 * @param {string} jobName
 * @param {Function} task
 */
const runAsJob = (module.exports.runAsJob = async function runAsJob(
  jobName,
  task,
) {
  await JobStatusModel.notify(jobName, JOB_STATES.RUNNING);

  try {
    await task();

    await JobStatusModel.notify(jobName, JOB_STATES.DONE);
  } catch (e) {
    try {
      await JobStatusModel.notify(jobName, JOB_STATES.ERROR, { error: `${e}` });
    } catch (ee) {
      console.error(ee);
    }

    throw e;
  }
});

/**
 * @param {Job} job
 */
module.exports.runJob = async function runJob(job) {
  return await runAsJob(job.name, job.run);
};

/**
 * @typedef {Object} Job
 * @property {string} name
 * @property {string?} description
 * @property {Function} run
 */

/** @type {Map<string, Job>?} */
let jobs = null;

/**
 * Find all registered jobs.
 *
 * @returns {Map<string, Job>}
 */
module.exports.findJobs = function findJobs() {
  if (jobs) {
    return jobs;
  }

  jobs = new Map();

  requireAll({
    dirname: join(__dirname, ".."),
    recursive: true,
    filter: /^(.*)\.jobs?\.js$/,
    excludeDirs: /^(\.|node_modules$)/,
    resolve: (jobsModule) => {
      for (const jobDesc of jobsModule.getJobs()) {
        jobs.set(jobDesc.name, jobDesc);
      }
    },
  });

  return jobs;
};

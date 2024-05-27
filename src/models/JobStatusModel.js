const mongoose = require("mongoose");
const { subDays } = require("date-fns/subDays");

/** @enum */
const JOB_STATES = (module.exports.JOB_STATES = {
  UNKNOWN: "UNKNOWN",
  RUNNING: "RUNNING",
  ERROR: "ERROR",
  DONE: "DONE",
});

/**
 * Error that happens when attempt to update a state
 */
const JobStateCollisionError =
  (module.exports.JobStateCollisionError = class JobStateCollisionError extends (
    Error
  ) {
    /**
     * @param {string} job
     * @param {JOB_STATES} state
     */
    constructor(job, state) {
      super(`Job ${job} is already in ${state} state`);

      this.job = job;
      this.state = state;
    }
  });

const jobStatusSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  stateTime: {
    type: Date,
  },
  state: {
    type: String,
    enum: Object.values(JOB_STATES),
    default: JOB_STATES.UNKNOWN,
  },
  info: {},
});

const STUCK_JOB_TIMEOUT_DAYS = 7;

async function notifyStateChange(jobName, state, info) {
  const now = new Date();
  const threshold = subDays(now, STUCK_JOB_TIMEOUT_DAYS);

  const { modifiedCount } = await this.updateOne(
    {
      name: jobName,
      $or: [{ state: { $ne: state } }, { stateTime: { $lt: threshold } }],
    },
    {
      $set: { state, stateTime: now, info },
    },
  );

  if (modifiedCount < 1) {
    if (!(await this.exists({ name: jobName }))) {
      await this.updateOne({ name: jobName }, {}, { upsert: true });

      return this.notify(jobName, state, info);
    }

    throw new JobStateCollisionError(jobName, state);
  }
}

jobStatusSchema.static("notify", notifyStateChange);

module.exports.JobStatusModel = mongoose.model("JobStatus", jobStatusSchema);

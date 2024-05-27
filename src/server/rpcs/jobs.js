const { findJobs, runJob } = require("../../services/jobsService");
const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { authenticateCall } = require("../authenticate");
const {
  JOB_STATES,
  JobStatusModel,
  JobStateCollisionError,
} = require("../../models/JobStatusModel");
const {
  InvalidArgument,
  NotFound,
  FailedPrecondition,
} = require("../utils/errors");

module.exports.ListJobs = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  for (const [name, job] of findJobs().entries()) {
    const status = await JobStatusModel.findOne({ name });

    yield {
      name,
      description: job.description,
      state: status?.state ?? JOB_STATES.UNKNOWN,
      stateTime: status?.stateTime?.toISOString(),
      info: status?.info ? JSON.stringify(status.info) : undefined,
    };
  }
});

module.exports.RunJob = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { name } = call.request;

  if (!name) {
    throw new InvalidArgument("Job name is missing");
  }

  const allJobs = findJobs();

  if (!allJobs.has(name)) {
    throw new NotFound("Job not found");
  }

  try {
    await runJob(allJobs.get(name));
  } catch (e) {
    if (
      e instanceof JobStateCollisionError &&
      e.job === name &&
      e.state === JOB_STATES.RUNNING
    ) {
      throw new FailedPrecondition(
        "The job is already running. " +
          "If you are sure it is not, then the job has failed the way it could not report it's status. " +
          "Please update/delete the job status record manually in such case.",
      );
    }

    throw e;
  }

  return {};
});

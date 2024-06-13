const unaryAsyncImpl = require("../utils/unaryAsyncImpl");
const streamAsyncImpl = require("../utils/streamAsyncImpl");
const { AccountModel } = require("../../models/Account");
const { ActionModel } = require("../../models/Action");
const { NotFound, InvalidArgument, AlreadyExists } = require("../utils/errors");
const { authenticateCall } = require("../authenticate");
const {
  createAction,
  InvalidActionError,
  DuplicateActionError,
  getActionsConfigurations,
} = require("../../services/gamificationService");
const { useMongodbSession } = require("../../utils/useMongoSession");

function actionToResponse(action) {
  return {
    action: action.action,
    key: action.key ?? undefined,
    assignedAt: action.createdAt.toISOString(),
  };
}

module.exports.GetAccountActions = streamAsyncImpl(async function* (call) {
  await authenticateCall(call);

  const { account } = call.request;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new NotFound("Account not found");
  }

  for await (const action of ActionModel.find({
    account: accountDoc._id,
  })) {
    yield actionToResponse(action);
  }
});

module.exports.CreateAction = unaryAsyncImpl(async (call) => {
  await authenticateCall(call);

  const { account, action, key } = call.request;

  if (!account) {
    throw new InvalidArgument("Missing account ID");
  }

  if (!action) {
    throw new InvalidArgument("Missing action name");
  }

  const accountDoc = await AccountModel.findOne({ externalId: account });

  if (!accountDoc) {
    throw new NotFound("Account not found");
  }

  try {
    const assigned = await useMongodbSession((session) =>
      createAction(accountDoc._id, action, key, session),
    );

    return actionToResponse(assigned);
  } catch (e) {
    if (e instanceof InvalidActionError) {
      throw new InvalidArgument(e.message);
    }

    if (e instanceof DuplicateActionError) {
      throw new AlreadyExists("Action already exists");
    }

    throw e;
  }
});

module.exports.GetActionsConfiguration = streamAsyncImpl(
  async function* (call) {
    await authenticateCall(call);

    const configurations = getActionsConfigurations();

    for (const [
      name,
      { xp = 0, reward = 0, repeatable = false },
    ] of Object.entries(configurations)) {
      yield {
        name,
        xp,
        reward,
        repeatable,
      };
    }
  },
);

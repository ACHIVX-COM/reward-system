const assert = require("assert");
const requireAll = require("require-all");
const Medal = require("./Medal");
const LeaderBoard = require("./LeaderBoard");
const Achievement = require("./Achievement");

const medalTypes = (module.exports.medalTypes = new Map());

requireAll({
  dirname: __dirname,
  filter: /\.medal\.js$/,
  excludeDirs: /^(\.|node_modules$)/,
  resolve(module) {
    assert.ok(
      module.prototype instanceof Medal,
      "Default export of a medal module must be a Medal subclass",
    );

    medalTypes.set(module.typeName, module);
  },
});

const leaderBoardTypes = (module.exports.leaderBoardTypes = new Map());

requireAll({
  dirname: __dirname,
  filter: /\.leaderboard\.js$/,
  excludeDirs: /^(\.|node_modules$)/,
  resolve(module) {
    assert.ok(
      module.prototype instanceof LeaderBoard,
      "Default export of a leader board module must be a LeaderBoard subclass",
    );

    leaderBoardTypes.set(module.typeName, module);
  },
});

const achievementTypes = (module.exports.achievementTypes = new Map());

requireAll({
  dirname: __dirname,
  filter: /\.achievement\.js$/,
  excludeDirs: /^(\.|node_modules$)/,
  resolve(module) {
    assert.ok(
      module.prototype instanceof Achievement,
      "Default export of achievement module must be a Achievement subclass",
    );

    achievementTypes.set(module.typeName, module);
  },
});

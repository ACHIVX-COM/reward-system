const assert = require("assert");
const requireAll = require("require-all");
const Medal = require("./Medal");

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

#!/bin/bash

# This script is for internal development purposes, e.g. setup replicaset in local or CI environement.
# DON'T RUN THIS IN REMOTE ENVIRONMENTS!

MONGOD_MASTER=`getent ahosts ${MONGOD_MASTER_HOSTNAME} | head -n 1 | awk '{ print $1 }'`

echo MONGOD_MASTER=$MONGOD_MASTER

mongosh --host $MONGOD_MASTER << EOF
  const config = {
    _id: "$REPL_SET",
    protocolVersion: 1,
    members: [
      { _id: 0, host: "$MONGOD_MASTER:27017" }
    ]
  };

  try {
    rs.conf();
    rs.reconfig(config, { force: true });
  } catch (e) {
    rs.initiate(config);
  }
EOF

const grpc = require("@grpc/grpc-js");

module.exports.NotFound = class NotFound extends Error {
  constructor(message = "Not found") {
    super(message);
    this.code = grpc.status.NOT_FOUND;
  }
};

module.exports.InvalidArgument = class InvalidArgument extends Error {
  constructor(message = "Invalid argument") {
    super(message);
    this.code = grpc.status.INVALID_ARGUMENT;
  }
};

module.exports.Unauthenticated = class Unauthenticated extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.code = grpc.status.UNAUTHENTICATED;
  }
};

module.exports.PermissionDenied = class PermissionDenied extends Error {
  constructor(message = "Permission denied") {
    super(message);
    this.code = grpc.status.PERMISSION_DENIED;
  }
};

module.exports.FailedPrecondition = class FailedPrecondition extends Error {
  constructor(message = "Precondition failed") {
    super(message);
    this.code = grpc.status.FAILED_PRECONDITION;
  }
};

module.exports.AlreadyExists = class AlreadyExists extends Error {
  constructor(message = "Already exists") {
    super(message);
    this.code = grpc.status.ALREADY_EXISTS;
  }
};

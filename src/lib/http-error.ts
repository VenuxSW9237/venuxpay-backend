export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new HttpError(400, code, message);
  }
  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new HttpError(401, code, message);
  }
  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new HttpError(403, code, message);
  }
  static notFound(message = "Not found", code = "NOT_FOUND") {
    return new HttpError(404, code, message);
  }
  static conflict(message: string, code = "CONFLICT") {
    return new HttpError(409, code, message);
  }
  static internal(message = "Internal server error", code = "INTERNAL_ERROR") {
    return new HttpError(500, code, message);
  }
}

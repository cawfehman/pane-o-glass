import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: ["email", "ip", "username", "ad.email", "ad.username", "sourceIp", "clientIp", "req.headers['x-forwarded-for']", "req.connection.remoteAddress"],
    censor: "[REDACTED]"
  },
  transport: process.env.NODE_ENV !== "production"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true
        }
      }
    : undefined
});

export default logger;

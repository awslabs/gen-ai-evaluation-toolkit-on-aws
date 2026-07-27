import { ServiceName } from '@common/config';
import { Logger, LogLevel } from '@aws-lambda-powertools/logger';

export const log = new Logger({
  serviceName: ServiceName,
  logLevel: LogLevel.INFO,
});

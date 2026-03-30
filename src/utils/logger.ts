import chalk from 'chalk';

export type LogLevel = 'quiet' | 'default' | 'verbose' | 'debug';

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
  debug(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const prefix = chalk.dim('[mcp-live-bridge]');
  const isQuiet = level === 'quiet';
  const isVerbose = level === 'verbose' || level === 'debug';
  const isDebug = level === 'debug';

  return {
    info(msg: string) {
      if (isQuiet) return;
      console.log(prefix, msg);
    },
    verbose(msg: string) {
      if (!isVerbose) return;
      console.log(prefix, chalk.dim(msg));
    },
    debug(msg: string) {
      if (!isDebug) return;
      console.log(prefix, chalk.cyan(msg));
    },
    warn(msg: string) {
      if (isQuiet) return;
      console.log(prefix, chalk.yellow(msg));
    },
    error(msg: string) {
      console.log(prefix, chalk.red(msg));
    },
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, type Logger } from '../src/utils/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let logger: Logger;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleSpy.mockClear();
    logger = createLogger('default');
  });

  it('logs info messages with prefix', () => {
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[mcp-live-bridge]'),
      expect.stringContaining('test message')
    );
  });

  it('logs verbose messages only in verbose mode', () => {
    logger.verbose('debug detail');
    expect(consoleSpy).not.toHaveBeenCalled();

    const verboseLogger = createLogger('verbose');
    consoleSpy.mockClear();
    verboseLogger.verbose('debug detail');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs errors in quiet mode', () => {
    const quietLogger = createLogger('quiet');
    quietLogger.info('should not show');
    expect(consoleSpy).not.toHaveBeenCalled();

    quietLogger.error('should show');
    expect(consoleSpy).toHaveBeenCalled();
  });
});

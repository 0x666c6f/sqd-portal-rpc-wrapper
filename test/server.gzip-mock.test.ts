import { describe, expect, it } from 'vitest';
import { __test__ as serverTest } from '../src/server';

describe('server gzip error handling', () => {
  it('classifies gunzip errors', () => {
    const sizeLimit = serverTest.classifyGunzipError(new Error('maxOutputLength exceeded'));
    expect(sizeLimit.reason).toBe('size_limit');
    expect(sizeLimit.message).toContain('maxOutputLength');

    const corrupt = serverTest.classifyGunzipError('boom');
    expect(corrupt.reason).toBe('corrupt');
    expect(corrupt.message).toBe('boom');
  });
});

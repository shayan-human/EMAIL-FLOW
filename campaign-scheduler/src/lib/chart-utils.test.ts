import { describe, it, expect } from 'vitest';
import { processChartData } from './chart-utils';
import type { LeadData } from './types';

describe('processChartData', () => {
    it('should return exactly three keys: 24H, 7D, 30D', () => {
        const dummyData: LeadData[] = [
            { id: '1', sent_at: new Date().toISOString() },
            { id: '2', sent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        ];

        const result = processChartData(dummyData);

        expect(result).toHaveProperty('24H');
        expect(result).toHaveProperty('7D');
        expect(result).toHaveProperty('30D');

        expect(Array.isArray(result['24H'])).toBe(true);
        expect(Array.isArray(result['7D'])).toBe(true);
        expect(Array.isArray(result['30D'])).toBe(true);
    });
});

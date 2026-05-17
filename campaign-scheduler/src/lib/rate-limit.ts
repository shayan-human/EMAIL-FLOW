export const rateLimit = (options: {
    interval: number;
    uniqueTokenPerInterval: number;
}) => {
    const tokenCache = new Map<string, number[]>();

    return {
        check: (limit: number, token: string) =>
            new Promise<void>((resolve, reject) => {
                const tokenCount = tokenCache.get(token) || [0];

                // Simple interval wipeout mechanism
                if (tokenCount[0] === 0) {
                    setTimeout(() => {
                        tokenCache.delete(token);
                    }, options.interval);
                }

                tokenCount[0] += 1;
                tokenCache.set(token, tokenCount);

                const currentUsage = tokenCount[0];
                const isRateLimited = currentUsage > limit;

                if (isRateLimited) {
                    reject('Rate limit exceeded');
                } else {
                    resolve();
                }
            }),
    };
};

export const globalRateLimiter = rateLimit({
    interval: 60 * 1000, // 60 seconds
    uniqueTokenPerInterval: 500, // Max 500 users per minute stored
});

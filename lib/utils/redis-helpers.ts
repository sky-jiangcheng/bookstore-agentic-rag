export async function getStringSetMembers(key: string, redis: { smembers: (key: string) => Promise<unknown[]> } | null): Promise<string[]> {
  if (!redis) {
    return [];
  }

  const members = await redis.smembers(key);
  return (members as unknown[]).filter((member): member is string => typeof member === 'string');
}

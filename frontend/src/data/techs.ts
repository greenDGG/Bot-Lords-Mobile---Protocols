let cached: any = null;
let resolvers: Array<(data: any) => void> = [];

export function setTechsData(data: any): void {
  cached = data;
  for (const r of resolvers) r(data);
  resolvers = [];
}

export function getTechsData(): Promise<any> {
  if (cached) return Promise.resolve(cached);
  return new Promise(resolve => resolvers.push(resolve));
}

export function getTechsSync(): any {
  return cached;
}

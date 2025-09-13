let camelcaseKeys: any;

export async function toCamel<T = any>(data: any, options: any = {}): Promise<T> {
  if (!camelcaseKeys) {
    camelcaseKeys = (await import('camelcase-keys')).default;
  }
  return camelcaseKeys(data, options);
}

export type CabinetSearchResult = {
  source_type: 'personal' | 'standard';
  personal_product_id: number | null;
  standard_product_id: number | null;
  in_cabinet: boolean;
};

export type ReadyProduct = { product_id: number };

export function createProductSearchGuard() {
  let generation = 0;
  let query = '';
  return {
    begin(nextQuery: string): number {
      generation += 1;
      query = nextQuery;
      return generation;
    },
    accept(responseGeneration: number, responseQuery: string): boolean {
      return responseGeneration === generation && responseQuery === query;
    },
  };
}

export function selectedPersonalProductId(result: CabinetSearchResult): number | null {
  return result.in_cabinet ? result.personal_product_id : null;
}

export function selectReadyProduct(current: number[], ready: ReadyProduct): number[] {
  return [...new Set([...current, ready.product_id])].sort((left, right) => left - right);
}

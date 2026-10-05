export class LoadCoordinator {
  private generation = 0;
  private mainToken = 0;
  private mainAbortController: AbortController | null = null;
  private readonly layerTokens = new Map<
    string,
    { token: number; abortController: AbortController }
  >();

  beginMain(): number {
    this.mainAbortController?.abort();
    this.mainAbortController = new AbortController();
    this.mainToken = ++this.generation;
    return this.mainToken;
  }

  isMainCurrent(token: number): boolean {
    return this.mainToken === token;
  }

  cancelMain(): void {
    this.mainAbortController?.abort();
    this.mainAbortController = null;
    this.mainToken = ++this.generation;
  }

  mainSignal(token: number): AbortSignal | undefined {
    return this.isMainCurrent(token) ? this.mainAbortController?.signal : undefined;
  }

  beginLayer(layerId: string): number {
    this.layerTokens.get(layerId)?.abortController.abort();
    const token = ++this.generation;
    this.layerTokens.set(layerId, { token, abortController: new AbortController() });
    return token;
  }

  isLayerCurrent(layerId: string, token: number): boolean {
    return this.layerTokens.get(layerId)?.token === token;
  }

  layerSignal(layerId: string, token: number): AbortSignal | undefined {
    const current = this.layerTokens.get(layerId);
    return current?.token === token ? current.abortController.signal : undefined;
  }

  cancelLayer(layerId: string): void {
    this.layerTokens.get(layerId)?.abortController.abort();
    this.layerTokens.delete(layerId);
    this.generation += 1;
  }

  cancelAll(): void {
    this.mainAbortController?.abort();
    this.mainAbortController = null;
    this.mainToken = ++this.generation;
    this.layerTokens.forEach(({ abortController }) => abortController.abort());
    this.layerTokens.clear();
  }
}

export const loadCoordinator = new LoadCoordinator();

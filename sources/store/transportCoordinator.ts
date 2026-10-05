class TransportCoordinator {
  private generation = 0;

  beginPlay(): number {
    return ++this.generation;
  }

  isCurrent(token: number): boolean {
    return this.generation === token;
  }

  cancelPendingPlay(): void {
    this.generation += 1;
  }
}

export const transportCoordinator = new TransportCoordinator();

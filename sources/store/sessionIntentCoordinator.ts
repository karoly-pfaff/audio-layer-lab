class SessionIntentCoordinator {
  private generation = 0;

  beginIntent(): number {
    return ++this.generation;
  }

  noteStateMutation(): void {
    this.generation += 1;
  }

  isCurrent(token: number): boolean {
    return this.generation === token;
  }
}

export const sessionIntentCoordinator = new SessionIntentCoordinator();

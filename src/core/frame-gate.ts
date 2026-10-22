export type Ticket = { id: number; generation: number };

/** At most one in-flight frame. A source switch invalidates results, not ownership. */
export class FrameGate {
  private generation = 0;
  private sequence = 0;
  private pending: Ticket | null = null;

  begin(): Ticket | null {
    if (this.pending) return null;
    this.pending = { id: ++this.sequence, generation: this.generation };
    return this.pending;
  }
  invalidate(): void { this.generation++; }
  isPending(ticket: Ticket): boolean { return this.pending?.id === ticket.id; }
  isCurrent(ticket: Ticket): boolean { return this.isPending(ticket) && ticket.generation === this.generation; }
  complete(ticket: Ticket): boolean {
    if (!this.isPending(ticket)) return false;
    this.pending = null;
    return ticket.generation === this.generation;
  }
}

/**
 * Message Queue for offline handling
 * Persists messages locally and retries on reconnection
 */

export interface QueuedMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

interface IMessageQueue {
  enqueue(message: Omit<QueuedMessage, 'id' | 'timestamp' | 'retryCount'> & { id?: string }): void;
  dequeue(): QueuedMessage | undefined;
  peek(): QueuedMessage | undefined;
  isEmpty(): boolean;
  clear(): void;
  size(): number;
  getAll(): QueuedMessage[];
}

const STORAGE_KEY = 'sync.message.queue.v1';
const MAX_RETRIES = 3;

// Unique ID generator
const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export class MessageQueue implements IMessageQueue {
  private messages: QueuedMessage[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.messages = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[MessageQueue] Failed to load from storage', error);
      this.messages = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
    } catch (error) {
      console.warn('[MessageQueue] Failed to save to storage', error);
    }
  }

  enqueue(message: Omit<QueuedMessage, 'id' | 'timestamp' | 'retryCount'> & { id?: string }): void {
    const queuedMessage: QueuedMessage = {
      id: message.id ?? generateId(),
      ...message,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: message.maxRetries ?? MAX_RETRIES,
    };
    this.messages.push(queuedMessage);
    this.saveToStorage();
  }

  dequeue(): QueuedMessage | undefined {
    const message = this.messages.shift();
    if (message) {
      this.saveToStorage();
    }
    return message;
  }

  peek(): QueuedMessage | undefined {
    return this.messages[0];
  }

  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  size(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  getAll(): QueuedMessage[] {
    return [...this.messages];
  }

  incrementRetry(messageId: string): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.retryCount++;
      this.saveToStorage();
    }
  }

  removeMessage(messageId: string): void {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    this.saveToStorage();
  }
}

export default MessageQueue;

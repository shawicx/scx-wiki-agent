import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../../../src/core/retrieval/intent-classifier.js';

describe('IntentClassifier', () => {
  const classifier = new IntentClassifier();

  it('should classify flow queries', () => {
    const result = classifier.classify('Where is the user login flow?');
    expect(result.intent).toBe('flow_query');
    expect(result.keywords).toContain('user');
    expect(result.keywords).toContain('login');
  });

  it('should classify symbol queries', () => {
    const result = classifier.classify('What does UserService.createUser do?');
    expect(result.intent).toBe('symbol_query');
    expect(result.keywords).toContain('UserService');
    expect(result.keywords).toContain('createUser');
  });

  it('should classify architecture queries', () => {
    const result = classifier.classify('What is the overall architecture of this project?');
    expect(result.intent).toBe('architecture_query');
  });

  it('should extract PascalCase identifiers as keywords', () => {
    const result = classifier.classify('How does OrderService processPayment?');
    expect(result.keywords).toContain('OrderService');
    expect(result.keywords).toContain('processPayment');
  });
});

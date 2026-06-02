import { readFileSync } from 'fs';
import { join } from 'path';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { DatabaseConnection } from '../core/database.js';
import type { RelationGraph } from '../core/graph/relation-graph.js';
import { RetrievalService } from './retrieval-service.js';
import type { RankedResult } from '../core/retrieval/types.js';

export interface QAAnswer {
  answer: string;
  references: FileReference[];
}

export interface FileReference {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export class QAService {
  private retrieval: RetrievalService;
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection, graph: RelationGraph) {
    this.db = db;
    this.retrieval = new RetrievalService(db, graph);
  }

  async ask(question: string, rootDir: string): Promise<QAAnswer> {
    const { results } = this.retrieval.retrieve(question);
    const context = this.buildContext(results);
    const references = this.buildReferences(results, rootDir);

    // Rule-based answer generation (no LLM needed for basic answers)
    const answer = this.generateAnswer(question, results, context);

    return { answer, references };
  }

  async askWithLLM(question: string, rootDir: string): Promise<QAAnswer> {
    const { results } = this.retrieval.retrieve(question);
    const context = this.buildContext(results);
    const references = this.buildReferences(results, rootDir);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return this.ask(question, rootDir);
    }

    const prompt = `You are a code analysis assistant. Answer the following question based on the project code context.

Project Code Context:
${context}

Question: ${question}

Answer the question with specific file references and line numbers. Use markdown formatting.`;

    const result = streamText({
      model: openai('gpt-4o-mini'),
      prompt,
    });

    let answer = '';
    for await (const chunk of result.textStream) {
      answer += chunk;
    }

    return { answer, references };
  }

  async *askStream(question: string, rootDir: string): AsyncGenerator<string, QAAnswer> {
    const { results } = this.retrieval.retrieve(question);
    const context = this.buildContext(results);
    const references = this.buildReferences(results, rootDir);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      const answer = this.generateAnswer(question, results, context);
      yield answer;
      return { answer, references };
    }

    const prompt = `You are a code analysis assistant. Answer the following question based on the project code context.

Project Code Context:
${context}

Question: ${question}

Answer with specific file references and line numbers. Use markdown formatting.`;

    const result = streamText({
      model: openai('gpt-4o-mini'),
      prompt,
    });

    let answer = '';
    for await (const chunk of result.textStream) {
      answer += chunk;
      yield chunk;
    }

    return { answer, references };
  }

  buildContext(results: RankedResult[]): string {
    const parts: string[] = [];

    for (const result of results) {
      parts.push(`### ${result.filePath} (L${result.startLine}-${result.endLine})`);
      parts.push('```typescript');
      parts.push(result.content);
      parts.push('```');
      parts.push('');
    }

    return parts.join('\n');
  }

  private buildReferences(results: RankedResult[], rootDir: string): FileReference[] {
    return results.slice(0, 10).map((r) => ({
      filePath: r.filePath,
      startLine: r.startLine,
      endLine: r.endLine,
      snippet: r.content.slice(0, 200),
    }));
  }

  private generateAnswer(question: string, results: RankedResult[], context: string): string {
    if (results.length === 0) {
      return `No relevant code found for: "${question}"`;
    }

    const lines: string[] = [];
    lines.push(`Based on the codebase analysis for: "${question}"\n`);

    for (const result of results.slice(0, 5)) {
      lines.push(`**${result.filePath}:${result.startLine}-${result.endLine}** (score: ${result.finalScore.toFixed(2)}, sources: ${result.sources.join(', ')})`);
      lines.push(`\`\`\`\n${result.content.slice(0, 500)}\n\`\`\`\n`);
    }

    return lines.join('\n');
  }
}

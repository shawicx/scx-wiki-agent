import type { ClassifiedQuery, QueryIntent } from './types.js';

const FLOW_INDICATORS = [
  /flow/i, /process/i, /pipeline/i, /lifecycle/i, /workflow/i,
  /how does .+ (work|handle|process)/i, /where is .+ (handled|processed)/i,
  /流程/i, /过程/i, /调用链/i, /怎么处理/i,
];

const SYMBOL_INDICATORS = [
  /\b[A-Z]\w*\.\w+\b/, // UserService.createUser
  /what (does|is) \w+/i,
  /function\s+\w+/i,
  /method\s+\w+/i,
  /什么/i, /在哪里/i,
];

const ARCHITECTURE_INDICATORS = [
  /architect/i, /overall/i, /structure/i, /design/i, /module/i,
  /组件/i, /架构/i, /整体/i, /结构/i,
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'down',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'it', 'its', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'they', 'them', 'their',
]);

export class IntentClassifier {
  classify(query: string): ClassifiedQuery {
    const intent = this.detectIntent(query);
    const keywords = this.extractKeywords(query);
    const rewrittenQuery = this.rewriteQuery(query, keywords);

    return { original: query, intent, keywords, rewrittenQuery };
  }

  private detectIntent(query: string): QueryIntent {
    if (FLOW_INDICATORS.some((r) => r.test(query))) return 'flow_query';
    if (ARCHITECTURE_INDICATORS.some((r) => r.test(query))) return 'architecture_query';
    if (SYMBOL_INDICATORS.some((r) => r.test(query))) return 'symbol_query';

    // Default: treat as symbol query (most common case)
    return 'symbol_query';
  }

  private extractKeywords(query: string): string[] {
    const keywords: Set<string> = new Set();

    // Extract PascalCase identifiers
    const pascalRegex = /\b([A-Z][a-zA-Z0-9]+)\b/g;
    let match;
    while ((match = pascalRegex.exec(query)) !== null) {
      keywords.add(match[1]);
    }

    // Extract dot-notation: Service.method
    const dotRegex = /\b([A-Z]\w*)\.(\w+)\b/g;
    while ((match = dotRegex.exec(query)) !== null) {
      keywords.add(match[1]);
      keywords.add(match[2]);
    }

    // Extract camelCase identifiers
    const camelRegex = /\b([a-z]\w*[A-Z]\w*)\b/g;
    while ((match = camelRegex.exec(query)) !== null) {
      keywords.add(match[1]);
    }

    // Extract quoted strings
    const quotedRegex = /['"`](\w+)['"`]/g;
    while ((match = quotedRegex.exec(query)) !== null) {
      keywords.add(match[1]);
    }

    // Extract meaningful lowercase words (filter stop words)
    const wordRegex = /\b([a-zA-Z]+)\b/g;
    while ((match = wordRegex.exec(query)) !== null) {
      const word = match[1];
      if (!STOP_WORDS.has(word.toLowerCase()) && word.length >= 3) {
        keywords.add(word);
      }
    }

    // For Chinese: extract meaningful segments (simple approach)
    const chineseRegex = /[一-龥]{2,}/g;
    while ((match = chineseRegex.exec(query)) !== null) {
      keywords.add(match[0]);
    }

    return [...keywords];
  }

  private rewriteQuery(query: string, keywords: string[]): string {
    // Use keywords to create a focused search query
    if (keywords.length === 0) return query;
    return keywords.join(' ');
  }
}

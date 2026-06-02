/**
 * WikiBuilder — fluent utility for constructing markdown wiki pages.
 *
 * Each method returns `this` so calls can be chained.
 * Call `build()` at the end to get the final markdown string.
 */
export class WikiBuilder {
  private sections: string[] = [];

  /** Add a top-level title: `# title` */
  addTitle(title: string): this {
    this.sections.push(`# ${title}`);
    return this;
  }

  /** Add a second-level section: `## title\n\ncontent` */
  addSection(title: string, content: string): this {
    this.sections.push(`## ${title}\n\n${content}`);
    return this;
  }

  /** Add a third-level sub-section: `### title\n\ncontent` */
  addSubSection(title: string, content: string): this {
    this.sections.push(`### ${title}\n\n${content}`);
    return this;
  }

  /** Add a plain paragraph. */
  addParagraph(text: string): this {
    this.sections.push(text);
    return this;
  }

  /** Add a fenced code block with an optional language hint. */
  addCodeBlock(language: string, code: string): this {
    this.sections.push(`\`\`\`${language}\n${code}\n\`\`\``);
    return this;
  }

  /** Add a markdown table from headers and rows. */
  addTable(headers: string[], rows: string[][]): this {
    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyLines = rows.map((row) => `| ${row.join(' | ')} |`);
    this.sections.push([headerLine, separatorLine, ...bodyLines].join('\n'));
    return this;
  }

  /** Add a bullet list. */
  addBulletList(items: string[]): this {
    this.sections.push(items.map((item) => `- ${item}`).join('\n'));
    return this;
  }

  /** Add an empty line. */
  addNewline(): this {
    this.sections.push('');
    return this;
  }

  /** Join all sections with newlines and return the final document. */
  build(): string {
    return this.sections.join('\n\n');
  }
}

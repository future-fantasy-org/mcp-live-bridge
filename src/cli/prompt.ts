import * as readline from 'node:readline';

export function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

export function formatChoices(choices: string[], selectedIndex: number = -1): string {
  return choices
    .map((choice, i) => {
      const marker = selectedIndex === i ? '>' : ' ';
      return ` ${marker} ${i + 1}. ${choice}`;
    })
    .join('\n');
}

export function validateRequired(value: string): string | null {
  return value.length > 0 ? null : 'This field is required';
}

export function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'URL must start with http:// or https://';
  } catch {
    return 'Invalid URL format';
  }
}

export function validatePort(value: string): string | null {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return 'Port must be a number between 1 and 65535';
  }
  return null;
}

export function parseChoiceIndex(input: string, max: number): number | null {
  const n = parseInt(input, 10);
  if (isNaN(n) || n < 1 || n > max) return null;
  return n;
}

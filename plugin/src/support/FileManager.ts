import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates a file only if it does not already exist.
 * Used for custom NSE files to preserve user customizations.
 */
export function createFileIfNoneExists(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Ensures a directory exists, creating it recursively if needed.
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
